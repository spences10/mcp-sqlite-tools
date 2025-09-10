/**
 * SQLite database client using better-sqlite3
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
	convert_sqlite_error,
	with_error_handling,
} from '../common/errors.js';
import { BackupInfo, DatabaseInfo } from '../common/types.js';
import { debug_log, get_config } from '../config.js';
import {
	close_all_databases,
	close_database,
	open_database,
	validate_database_path,
} from './connection-manager.js';
import {
	bulk_insert,
	describe_table,
	execute_query,
	execute_select_query,
	is_read_only_query,
	is_schema_query,
	list_tables,
	vacuum_database,
} from './query-executor.js';
import { export_schema, import_schema } from './schema-manager.js';

// Re-export all functions to maintain backward compatibility
export {
	bulk_insert,
	close_all_databases,
	close_database,
	describe_table,
	execute_query,
	execute_select_query,
	export_schema,
	import_schema,
	is_read_only_query,
	is_schema_query,
	list_tables,
	open_database,
	vacuum_database,
	validate_database_path,
};

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
