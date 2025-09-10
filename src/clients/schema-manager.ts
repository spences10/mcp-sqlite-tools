/**
 * Schema export/import functionality for SQLite Tools MCP server
 */
import { with_error_handling } from '../common/errors.js';
import { debug_log } from '../config.js';
import {
	execute_query,
	execute_select_query,
} from './query-executor.js';

/**
 * Export database schema as SQL or JSON
 */
export function export_schema(
	database_path: string,
	format: 'sql' | 'json' = 'sql',
	table_filter?: string[],
): { schema: string; tables_count: number } {
	return with_error_handling(() => {
		debug_log('Exporting schema:', {
			database_path,
			format,
			tables: table_filter,
		});

		// Get schema information from sqlite_master
		let query =
			'SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL';

		if (table_filter && table_filter.length > 0) {
			const table_list = table_filter.map((t) => `'${t}'`).join(', ');
			query += ` AND name IN (${table_list})`;
		}

		query +=
			" ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 ELSE 3 END, name";

		const result = execute_select_query(database_path, query);
		const schema_objects = result.rows;

		if (format === 'json') {
			// Return as JSON
			const json_schema = {
				database: database_path,
				export_date: new Date().toISOString(),
				tables_count: schema_objects.filter(
					(obj) => obj.type === 'table',
				).length,
				objects: schema_objects.map((obj) => ({
					name: obj.name,
					type: obj.type,
					sql: obj.sql,
				})),
			};

			return {
				schema: JSON.stringify(json_schema, null, 2),
				tables_count: json_schema.tables_count,
			};
		}

		// Return as SQL
		const sql_lines = [
			'-- SQLite Database Schema Export',
			`-- Database: ${database_path}`,
			`-- Export Date: ${new Date().toISOString()}`,
			'',
			'PRAGMA foreign_keys=OFF;',
			'',
		];

		// Group objects by type
		const tables = schema_objects.filter(
			(obj) => obj.type === 'table',
		);
		const indices = schema_objects.filter(
			(obj) =>
				obj.type === 'index' &&
				!obj.name.startsWith('sqlite_autoindex_'),
		);
		const views = schema_objects.filter((obj) => obj.type === 'view');
		const triggers = schema_objects.filter(
			(obj) => obj.type === 'trigger',
		);

		// Add tables first
		if (tables.length > 0) {
			sql_lines.push('-- Tables');
			tables.forEach((table) => {
				sql_lines.push(`${table.sql};`);
				sql_lines.push('');
			});
		}

		// Add indices
		if (indices.length > 0) {
			sql_lines.push('-- Indices');
			indices.forEach((index) => {
				sql_lines.push(`${index.sql};`);
			});
			sql_lines.push('');
		}

		// Add views
		if (views.length > 0) {
			sql_lines.push('-- Views');
			views.forEach((view) => {
				sql_lines.push(`${view.sql};`);
			});
			sql_lines.push('');
		}

		// Add triggers
		if (triggers.length > 0) {
			sql_lines.push('-- Triggers');
			triggers.forEach((trigger) => {
				sql_lines.push(`${trigger.sql};`);
			});
			sql_lines.push('');
		}

		sql_lines.push('PRAGMA foreign_keys=ON;');

		return {
			schema: sql_lines.join('\n'),
			tables_count: tables.length,
		};
	}, 'export_schema')();
}

/**
 * Import schema from SQL or JSON
 */
export function import_schema(
	database_path: string,
	schema: string,
	format: 'sql' | 'json' = 'sql',
): { statements_executed: number; tables_created: number } {
	return with_error_handling(() => {
		debug_log('Importing schema:', {
			database_path,
			format,
			schema_size: schema.length,
		});

		let statements: string[] = [];
		let expected_tables = 0;

		if (format === 'json') {
			try {
				const json_schema = JSON.parse(schema);

				if (
					!json_schema.objects ||
					!Array.isArray(json_schema.objects)
				) {
					throw new Error(
						'Invalid JSON schema format: missing objects array',
					);
				}

				statements = json_schema.objects
					.filter((obj: any) => obj.sql && obj.sql.trim())
					.map((obj: any) => obj.sql.trim());

				expected_tables = json_schema.objects.filter(
					(obj: any) => obj.type === 'table',
				).length;
			} catch (error) {
				throw new Error(`Failed to parse JSON schema: ${error}`);
			}
		} else {
			// Parse SQL statements
			// Split by semicolons and filter out comments and empty lines
			statements = schema
				.split(';')
				.map((stmt) => stmt.trim())
				.filter(
					(stmt) =>
						stmt &&
						!stmt.startsWith('--') &&
						!stmt.startsWith('PRAGMA'),
				)
				.filter((stmt) => stmt.toLowerCase().startsWith('create'));

			expected_tables = statements.filter((stmt) =>
				stmt.toLowerCase().includes('create table'),
			).length;
		}

		if (statements.length === 0) {
			throw new Error('No valid CREATE statements found in schema');
		}

		let statements_executed = 0;
		let tables_created = 0;
		const errors: string[] = [];

		// Execute each statement
		for (let i = 0; i < statements.length; i++) {
			const statement = statements[i];

			try {
				execute_query(database_path, statement);
				statements_executed++;

				if (statement.toLowerCase().includes('create table')) {
					tables_created++;
				}

				debug_log('Executed schema statement:', {
					statement_number: i + 1,
					type: statement.split(' ')[1]?.toLowerCase() || 'unknown',
				});
			} catch (error) {
				const error_msg = `Statement ${i + 1}: ${error}`;
				errors.push(error_msg);
				debug_log('Schema statement failed:', {
					statement_number: i + 1,
					error: error_msg,
					statement: statement.substring(0, 100) + '...',
				});
			}
		}

		// Report any errors
		if (errors.length > 0) {
			const error_summary = `${errors.length} statements failed:\n${errors.join('\n')}`;
			if (statements_executed === 0) {
				throw new Error(
					`Schema import failed completely: ${error_summary}`,
				);
			} else {
				debug_log(
					'Schema import completed with errors:',
					error_summary,
				);
			}
		}

		debug_log('Schema import completed:', {
			statements_executed,
			tables_created,
			expected_tables,
			errors: errors.length,
		});

		return { statements_executed, tables_created };
	}, 'import_schema')();
}
