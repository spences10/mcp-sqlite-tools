/**
 * SQLite database client using better-sqlite3
 */
import Database from 'better-sqlite3';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
	DatabaseConnectionError,
	PathSecurityError,
	convert_sqlite_error,
	with_error_handling,
} from '../common/errors.js';
import {
	BackupInfo,
	ColumnInfo,
	DatabaseInfo,
	QueryResult,
	TableInfo,
} from '../common/types.js';
import { debug_log, get_config } from '../config.js';

// Database connection pool
const connections = new Map<string, Database.Database>();

/**
 * Validate and resolve database path
 */
export function validate_database_path(path: string): string {
	const config = get_config();

	// Check if absolute paths are allowed
	if (isAbsolute(path) && !config.SQLITE_ALLOW_ABSOLUTE_PATHS) {
		throw new PathSecurityError(
			'Absolute paths are not allowed. Set SQLITE_ALLOW_ABSOLUTE_PATHS=true to enable.',
			path,
		);
	}

	// Resolve relative paths against the default directory
	let resolved_path: string;
	if (isAbsolute(path)) {
		resolved_path = path;
	} else {
		resolved_path = resolve(config.SQLITE_DEFAULT_PATH, path);
	}

	// Security check: ensure the resolved path is within allowed directories
	if (!config.SQLITE_ALLOW_ABSOLUTE_PATHS) {
		const relative_path = relative(
			config.SQLITE_DEFAULT_PATH,
			resolved_path,
		);
		if (relative_path.startsWith('..') || isAbsolute(relative_path)) {
			throw new PathSecurityError(
				'Path traversal outside the default directory is not allowed',
				path,
			);
		}
	}

	debug_log('Validated database path:', {
		original: path,
		resolved_path,
	});
	return resolved_path;
}

/**
 * Open or create a database connection
 */
export function open_database(
	path: string,
	create: boolean = true,
): Database.Database {
	return with_error_handling(() => {
		const resolved_path = validate_database_path(path);

		// Check if database already exists in connection pool
		if (connections.has(resolved_path)) {
			debug_log(
				'Reusing existing database connection:',
				resolved_path,
			);
			return connections.get(resolved_path)!;
		}

		// Check if file exists
		const exists = existsSync(resolved_path);
		if (!exists && !create) {
			throw new DatabaseConnectionError(
				`Database file does not exist: ${resolved_path}`,
				resolved_path,
			);
		}

		// Create directory if it doesn't exist
		if (!exists) {
			const dir = dirname(resolved_path);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
				debug_log('Created directory:', dir);
			}
		}

		try {
			// Open database connection
			const db = new Database(resolved_path);

			// Configure database for better performance and safety
			db.pragma('journal_mode = WAL');
			db.pragma('synchronous = NORMAL');
			db.pragma('cache_size = 1000');
			db.pragma('foreign_keys = ON');
			db.pragma('temp_store = MEMORY');

			// Store connection in pool
			connections.set(resolved_path, db);

			debug_log('Opened database connection:', resolved_path);
			return db;
		} catch (error) {
			throw convert_sqlite_error(error, resolved_path);
		}
	}, 'open_database')();
}

/**
 * Close a database connection
 */
export function close_database(path: string): void {
	return with_error_handling(() => {
		const resolved_path = validate_database_path(path);

		const db = connections.get(resolved_path);
		if (db) {
			db.close();
			connections.delete(resolved_path);
			debug_log('Closed database connection:', resolved_path);
		}
	}, 'close_database')();
}

/**
 * Close all database connections
 */
export function close_all_databases(): void {
	for (const [path, db] of connections) {
		try {
			db.close();
			debug_log('Closed database connection:', path);
		} catch (error) {
			console.error('Error closing database:', path, error);
		}
	}
	connections.clear();
}

/**
 * Convert parameters to the format expected by better-sqlite3
 */
function convert_parameters(params: Record<string, any>): any {
	if (!params || Object.keys(params).length === 0) {
		return {};
	}

	// Check if parameters are positional (numbered keys like "1", "2", etc.)
	const keys = Object.keys(params);
	const is_positional = keys.every((key) => /^\d+$/.test(key));

	if (is_positional) {
		// Convert to array for positional parameters
		const max_index = Math.max(...keys.map((k) => parseInt(k)));
		const param_array: any[] = new Array(max_index);

		for (const [key, value] of Object.entries(params)) {
			const index = parseInt(key) - 1; // Convert 1-based to 0-based indexing
			param_array[index] = value;
		}

		return param_array;
	}

	// Return as-is for named parameters
	return params;
}

/**
 * Execute a SQL query
 */
export function execute_query(
	database_path: string,
	query: string,
	params: Record<string, any> = {},
): QueryResult {
	return with_error_handling(() => {
		const db = open_database(database_path);

		try {
			debug_log('Executing query:', { query, params });

			// Prepare and execute the statement
			const stmt = db.prepare(query);
			const converted_params = convert_parameters(params);
			const result = stmt.run(converted_params);

			return {
				rows: [],
				changes: result.changes,
				lastInsertRowid: result.lastInsertRowid,
			};
		} catch (error) {
			throw convert_sqlite_error(error, database_path);
		}
	}, 'execute_query')();
}

/**
 * Execute a SELECT query and return rows
 */
export function execute_select_query(
	database_path: string,
	query: string,
	params: Record<string, any> = {},
): QueryResult {
	return with_error_handling(() => {
		const db = open_database(database_path);

		try {
			debug_log('Executing select query:', { query, params });

			// Prepare and execute the statement
			const stmt = db.prepare(query);
			const converted_params = convert_parameters(params);
			const rows = stmt.all(converted_params);

			return {
				rows: rows as Record<string, any>[],
				changes: 0,
				lastInsertRowid: 0,
			};
		} catch (error) {
			throw convert_sqlite_error(error, database_path);
		}
	}, 'execute_select_query')();
}

/**
 * List all tables in the database
 */
export function list_tables(database_path: string): TableInfo[] {
	return with_error_handling(() => {
		const result = execute_select_query(
			database_path,
			"SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name",
		);

		return result.rows as TableInfo[];
	}, 'list_tables')();
}

/**
 * Get table schema information
 */
export function describe_table(
	database_path: string,
	table_name: string,
): ColumnInfo[] {
	return with_error_handling(() => {
		const result = execute_select_query(
			database_path,
			`PRAGMA table_info(${table_name})`,
		);

		return result.rows as ColumnInfo[];
	}, 'describe_table')();
}

/**
 * Get database information
 */
export function get_database_info(
	database_path: string,
): DatabaseInfo {
	return with_error_handling(() => {
		const resolved_path = validate_database_path(database_path);
		const db = open_database(database_path);

		try {
			// Get file size
			const stats = statSync(resolved_path);

			// Get database metadata
			const page_size = db.pragma('page_size', {
				simple: true,
			}) as number;
			const page_count = db.pragma('page_count', {
				simple: true,
			}) as number;
			const encoding = db.pragma('encoding', {
				simple: true,
			}) as string;
			const user_version = db.pragma('user_version', {
				simple: true,
			}) as number;

			// Count tables
			const tables = list_tables(database_path);

			return {
				path: resolved_path,
				size: stats.size,
				tables: tables.length,
				page_size,
				page_count,
				encoding,
				user_version,
			};
		} catch (error) {
			throw convert_sqlite_error(error, resolved_path);
		}
	}, 'get_database_info')();
}

/**
 * Create a backup of the database
 */
export function backup_database(
	source_path: string,
	backup_path?: string,
): BackupInfo {
	return with_error_handling(() => {
		const config = get_config();
		const resolved_source_path = validate_database_path(source_path);

		// Generate backup path if not provided
		let resolved_backup_path: string;
		if (backup_path) {
			resolved_backup_path = validate_database_path(backup_path);
		} else {
			const timestamp = new Date()
				.toISOString()
				.replace(/[:.]/g, '-');
			const base_name =
				resolved_source_path.split('/').pop()?.replace('.db', '') ||
				'database';
			resolved_backup_path = resolve(
				config.SQLITE_BACKUP_PATH,
				`${base_name}-${timestamp}.db`,
			);
		}

		// Ensure backup directory exists
		const backup_dir = dirname(resolved_backup_path);
		if (!existsSync(backup_dir)) {
			mkdirSync(backup_dir, { recursive: true });
		}

		try {
			// Copy the database file
			copyFileSync(resolved_source_path, resolved_backup_path);

			// Get backup file size
			const stats = statSync(resolved_backup_path);

			const backup_info: BackupInfo = {
				source: resolved_source_path,
				destination: resolved_backup_path,
				timestamp: new Date().toISOString(),
				size: stats.size,
			};

			debug_log('Created database backup:', backup_info);
			return backup_info;
		} catch (error) {
			throw convert_sqlite_error(error, resolved_source_path);
		}
	}, 'backup_database')();
}

/**
 * Vacuum the database to optimize storage
 */
export function vacuum_database(database_path: string): void {
	return with_error_handling(() => {
		const db = open_database(database_path);

		try {
			debug_log('Vacuuming database:', database_path);
			db.exec('VACUUM');
		} catch (error) {
			throw convert_sqlite_error(error, database_path);
		}
	}, 'vacuum_database')();
}

/**
 * Check if a query is read-only
 */
export function is_read_only_query(query: string): boolean {
	const normalized_query = query.trim().toLowerCase();

	// Allow SELECT and PRAGMA statements
	return (
		normalized_query.startsWith('select') ||
		normalized_query.startsWith('pragma') ||
		normalized_query.startsWith('explain')
	);
}

/**
 * Check if a query is a schema modification
 */
export function is_schema_query(query: string): boolean {
	const normalized_query = query.trim().toLowerCase();

	return (
		normalized_query.startsWith('create') ||
		normalized_query.startsWith('drop') ||
		normalized_query.startsWith('alter')
	);
}

/**
 * List database files in a directory
 */
export function list_database_files(directory?: string): Array<{
	name: string;
	path: string;
	size: number;
	modified: string;
}> {
	return with_error_handling(() => {
		const config = get_config();

		// Use provided directory or default
		const search_dir = directory
			? validate_database_path(directory)
			: config.SQLITE_DEFAULT_PATH;

		if (!existsSync(search_dir)) {
			throw new Error(`Directory does not exist: ${search_dir}`);
		}

		const files = readdirSync(search_dir);
		const database_files: Array<{
			name: string;
			path: string;
			size: number;
			modified: string;
		}> = [];

		for (const file of files) {
			// Check if file has database extension
			if (
				file.endsWith('.db') ||
				file.endsWith('.sqlite') ||
				file.endsWith('.sqlite3')
			) {
				const file_path = resolve(search_dir, file);

				try {
					const stats = statSync(file_path);

					// Only include regular files
					if (stats.isFile()) {
						database_files.push({
							name: file,
							path: file_path,
							size: stats.size,
							modified: stats.mtime.toISOString(),
						});
					}
				} catch (error) {
					// Skip files that can't be accessed
					debug_log(
						'Skipping file due to access error:',
						file,
						error,
					);
				}
			}
		}

		// Sort by name
		database_files.sort((a, b) => a.name.localeCompare(b.name));

		debug_log('Found database files:', database_files);
		return database_files;
	}, 'list_database_files')();
}

// Cleanup on process exit
process.on('exit', close_all_databases);
process.on('SIGINT', close_all_databases);
process.on('SIGTERM', close_all_databases);
