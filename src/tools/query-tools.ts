/**
 * Query execution tools for the SQLite Tools MCP server
 */
import { McpServer } from 'tmcp';
import * as v from 'valibot';
import * as sqlite from '../clients/sqlite.js';
import {
	create_tool_error_response,
	create_tool_response,
} from '../common/errors.js';
import { debug_log } from '../config.js';
import {
	resolve_database_name,
	set_current_database,
} from './context.js';

// Valid SQLite parameter values
const SQLiteParamValue = v.union([
	v.string(),
	v.number(),
	v.boolean(),
	v.null(),
]);

// Input validation schemas
const ExecuteQuerySchema = v.object({
	query: v.pipe(v.string(), v.minLength(1), v.maxLength(10000)),
	params: v.optional(v.record(v.string(), SQLiteParamValue)),
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
});

const ExecuteReadQuerySchema = v.object({
	query: v.pipe(v.string(), v.minLength(1), v.maxLength(10000)),
	params: v.optional(v.record(v.string(), SQLiteParamValue)),
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
	limit: v.optional(
		v.pipe(v.number(), v.minValue(1), v.maxValue(50000)),
		10000,
	),
	offset: v.optional(
		v.pipe(v.number(), v.minValue(0), v.maxValue(1000000)),
		0,
	),
	verbosity: v.optional(
		v.union([v.literal('summary'), v.literal('detailed')]),
		'detailed',
	),
});

const BulkInsertSchema = v.object({
	table: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	data: v.pipe(
		v.array(v.record(v.string(), SQLiteParamValue)),
		v.minLength(1),
		v.maxLength(10000),
	),
	batch_size: v.optional(
		v.pipe(v.number(), v.minValue(1), v.maxValue(10000)),
		1000,
	),
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
});

/**
 * Register query execution tools with the server
 */
export function register_query_tools(server: McpServer<any>): void {
	server.tool<typeof ExecuteReadQuerySchema>(
		{
			name: 'execute_read_query',
			description:
				'✓ SAFE: Execute read-only SQL queries (SELECT, PRAGMA, EXPLAIN) that cannot modify data. Supports parameterized queries for security. Returns up to 10,000 rows by default (configurable via limit parameter). Supports pagination with offset parameter. Use verbosity="summary" for row count only, "detailed" for full results.',
			schema: ExecuteReadQuerySchema,
		},
		async ({
			query,
			params = {},
			database_name,
			limit = 10000,
			offset = 0,
			verbosity = 'detailed',
		}) => {
			try {
				debug_log('Executing tool: execute_read_query', {
					query,
					params,
					database_name,
					limit,
					offset,
					verbosity,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				// Validate that this is a read-only query
				if (!sqlite.is_read_only_query(query)) {
					throw new Error(
						'Only SELECT, PRAGMA, and EXPLAIN queries are allowed with execute_read_query',
					);
				}

				// Add LIMIT/OFFSET to query if not already present
				let modified_query = query;
				const query_lower = query.toLowerCase();
				if (
					!query_lower.includes('limit') &&
					!query_lower.includes('offset')
				) {
					const pagination_clause =
						offset > 0
							? `LIMIT ${limit} OFFSET ${offset}`
							: `LIMIT ${limit}`;
					modified_query = `${query.trim()} ${pagination_clause}`;
				}

				const result = sqlite.execute_select_query(
					database_path,
					modified_query,
					params,
				);

				// Format output based on verbosity
				const response_data =
					verbosity === 'summary'
						? {
								database: database_path,
								query: modified_query,
								row_count: result.rows.length,
								pagination: {
									limit,
									offset,
									returned_count: result.rows.length,
									has_more: result.rows.length === limit,
								},
								verbosity,
							}
						: {
								database: database_path,
								query: modified_query,
								result,
								row_count: result.rows.length,
								pagination: {
									limit,
									offset,
									returned_count: result.rows.length,
									has_more: result.rows.length === limit,
								},
								verbosity,
							};

				return create_tool_response(response_data);
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof ExecuteQuerySchema>(
		{
			name: 'execute_write_query',
			description:
				'⚠️ DESTRUCTIVE: Execute SQL that modifies data (INSERT, UPDATE, DELETE) but not schema. Supports parameterized queries to prevent SQL injection. Returns affected row count and execution statistics. Use transactions for multiple related changes.',
			schema: ExecuteQuerySchema,
		},
		async ({ query, params = {}, database_name }) => {
			try {
				debug_log('Executing tool: execute_write_query', {
					query,
					params,
					database_name,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				// Validate that this is not a read-only query and not a schema query
				if (sqlite.is_read_only_query(query)) {
					throw new Error(
						'SELECT, PRAGMA, and EXPLAIN queries should use execute_read_query',
					);
				}
				if (sqlite.is_schema_query(query)) {
					throw new Error(
						'DDL queries (CREATE, ALTER, DROP) should use execute_schema_query',
					);
				}

				const result = sqlite.execute_query(
					database_path,
					query,
					params,
				);

				return create_tool_response({
					database: database_path,
					query,
					result,
					message: `⚠️ DESTRUCTIVE OPERATION COMPLETED: Data modified in database '${database_path}'. Rows affected: ${result.changes}`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof ExecuteQuerySchema>(
		{
			name: 'execute_schema_query',
			description:
				'⚠️ SCHEMA CHANGE: Execute DDL queries (CREATE, ALTER, DROP) that modify database structure. Supports both single and multi-statement SQL (separated by semicolons). Changes table schemas, indexes, views, and triggers. Multi-statement execution is atomic - all statements succeed or all are rolled back. SQL comments (-- and /* */) are automatically stripped. These operations may lock tables. Validate queries carefully before execution.',
			schema: ExecuteQuerySchema,
		},
		async ({ query, params = {}, database_name }) => {
			try {
				debug_log('Executing tool: execute_schema_query', {
					query,
					params,
					database_name,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				// Execute schema statements (handles both single and multi-statement SQL)
				const result = sqlite.execute_schema_statements(
					database_path,
					query,
					params,
				);

				return create_tool_response({
					database: database_path,
					statements_executed: result.statements_executed,
					total_changes: result.total_changes,
					statements: result.statements,
					message:
						result.statements_executed === 1
							? `⚠️ SCHEMA CHANGE COMPLETED: Database structure modified in '${database_path}'. Changes: ${result.total_changes}`
							: `⚠️ SCHEMA CHANGE COMPLETED: ${result.statements_executed} DDL statements executed in '${database_path}'. Total changes: ${result.total_changes}`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof BulkInsertSchema>(
		{
			name: 'bulk_insert',
			description:
				'⚠️ DESTRUCTIVE: Insert multiple records efficiently in batches using prepared statements. Processes data in configurable batch sizes (default 1000) for optimal performance. All records must have identical column structures. Use transactions for atomicity across all batches.',
			schema: BulkInsertSchema,
		},
		async ({ table, data, batch_size = 1000, database_name }) => {
			try {
				debug_log('Executing tool: bulk_insert', {
					table,
					data_count: data.length,
					batch_size,
					database_name,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				const result = sqlite.bulk_insert(
					database_path,
					table,
					data,
					batch_size,
				);

				return create_tool_response({
					success: true,
					database: database_path,
					table,
					inserted: result.inserted,
					batches: result.batches,
					total_time: result.total_time,
					message: `⚠️ DESTRUCTIVE OPERATION COMPLETED: ${result.inserted} records inserted into table '${table}' in database '${database_path}'`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);
}
