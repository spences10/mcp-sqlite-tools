/**
 * SQL query execution for SQLite Tools MCP server
 */
import {
	convert_sqlite_error,
	with_error_handling,
} from '../common/errors.js';
import {
	ColumnInfo,
	QueryResult,
	TableInfo,
} from '../common/types.js';
import { debug_log } from '../config.js';
import { open_database } from './connection-manager.js';
import { has_active_transaction } from './transaction-manager.js';

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
 * Parse and validate multi-statement SQL
 * Returns array of individual SQL statements
 */
export function parse_sql_statements(sql: string): string[] {
	// Split by semicolons and clean up each statement
	const statements = sql
		.split(';')
		.map((stmt) => {
			// Remove SQL comments (-- style and /* */ style)
			let cleaned = stmt;
			// Remove single-line comments
			cleaned = cleaned.replace(/--[^\n]*/g, '');
			// Remove multi-line comments
			cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
			return cleaned.trim();
		})
		.filter((stmt) => stmt.length > 0);

	return statements;
}

/**
 * Execute multiple schema statements atomically
 */
export function execute_schema_statements(
	database_path: string,
	sql: string,
	params: Record<string, any> = {},
): {
	statements_executed: number;
	total_changes: number;
	statements: string[];
} {
	return with_error_handling(() => {
		const db = open_database(database_path);

		// Parse the SQL into individual statements
		const statements = parse_sql_statements(sql);

		if (statements.length === 0) {
			throw new Error('No valid SQL statements found');
		}

		// Validate that all statements are schema queries
		const non_schema_statements = statements.filter(
			(stmt) => !is_schema_query(stmt),
		);
		if (non_schema_statements.length > 0) {
			throw new Error(
				`Only DDL queries (CREATE, ALTER, DROP) are allowed with execute_schema_query. Found ${non_schema_statements.length} non-DDL statement(s). First non-DDL statement: ${non_schema_statements[0].substring(0, 100)}`,
			);
		}

		let statements_executed = 0;
		let total_changes = 0;
		const use_transaction = !has_active_transaction(database_path);

		try {
			debug_log('Executing schema statements:', {
				database_path,
				statement_count: statements.length,
				use_transaction,
			});

			// Start transaction if needed
			if (use_transaction && statements.length > 1) {
				db.exec('BEGIN');
			}

			// Execute each statement
			for (let i = 0; i < statements.length; i++) {
				const statement = statements[i];

				try {
					debug_log('Executing schema statement:', {
						index: i + 1,
						total: statements.length,
						statement: statement.substring(0, 100),
					});

					const stmt = db.prepare(statement);
					const converted_params = convert_parameters(params);
					const result = stmt.run(converted_params);

					total_changes += result.changes;
					statements_executed++;
				} catch (error) {
					throw new Error(
						`Failed to execute statement ${i + 1} of ${statements.length}: ${error instanceof Error ? error.message : String(error)}\nStatement: ${statement.substring(0, 200)}`,
					);
				}
			}

			// Commit transaction if needed
			if (use_transaction && statements.length > 1) {
				db.exec('COMMIT');
			}

			debug_log('Schema statements executed successfully:', {
				statements_executed,
				total_changes,
			});

			return { statements_executed, total_changes, statements };
		} catch (error) {
			// Rollback transaction on error
			if (use_transaction && statements.length > 1) {
				try {
					db.exec('ROLLBACK');
					debug_log('Transaction rolled back due to error');
				} catch (rollback_error) {
					debug_log('Error during rollback:', rollback_error);
				}
			}
			throw convert_sqlite_error(error, database_path);
		}
	}, 'execute_schema_statements')();
}

/**
 * Bulk insert data into a table efficiently
 */
export function bulk_insert(
	database_path: string,
	table: string,
	data: Record<string, any>[],
	batch_size: number = 1000,
): { inserted: number; batches: number; total_time: number } {
	return with_error_handling(() => {
		if (!data || data.length === 0) {
			throw new Error('No data provided for bulk insert');
		}

		const start_time = Date.now();
		const db = open_database(database_path);

		// Get column names from the first record
		const columns = Object.keys(data[0]);
		if (columns.length === 0) {
			throw new Error('First record contains no columns');
		}

		// Build the INSERT SQL with placeholders
		const placeholders = columns.map(() => '?').join(', ');
		const column_list = columns.join(', ');
		const insert_sql = `INSERT INTO ${table} (${column_list}) VALUES (${placeholders})`;

		try {
			debug_log('Bulk insert starting:', {
				table,
				records: data.length,
				batch_size,
				columns: columns.length,
			});

			// Prepare the statement once
			const stmt = db.prepare(insert_sql);
			let inserted = 0;
			let batch_count = 0;

			// Use transaction for better performance
			const use_transaction = !has_active_transaction(database_path);
			if (use_transaction) {
				db.exec('BEGIN');
			}

			try {
				// Process data in batches
				for (let i = 0; i < data.length; i += batch_size) {
					const batch = data.slice(i, i + batch_size);
					batch_count++;

					for (const record of batch) {
						// Ensure all required columns are present
						const values = columns.map((col) => {
							if (!(col in record)) {
								throw new Error(
									`Missing column '${col}' in record ${inserted + 1}`,
								);
							}
							return record[col];
						});

						const result = stmt.run(values);
						if (result.changes > 0) {
							inserted++;
						}
					}

					debug_log('Completed batch:', {
						batch: batch_count,
						batch_size: batch.length,
						total_inserted: inserted,
					});
				}

				if (use_transaction) {
					db.exec('COMMIT');
				}

				const total_time = Date.now() - start_time;

				debug_log('Bulk insert completed:', {
					table,
					inserted,
					batches: batch_count,
					total_time,
					records_per_second: Math.round(
						(inserted / total_time) * 1000,
					),
				});

				return { inserted, batches: batch_count, total_time };
			} catch (error) {
				if (use_transaction) {
					try {
						db.exec('ROLLBACK');
					} catch (rollback_error) {
						debug_log('Error during rollback:', rollback_error);
					}
				}
				throw error;
			}
		} catch (error) {
			throw convert_sqlite_error(error, database_path);
		}
	}, 'bulk_insert')();
}
