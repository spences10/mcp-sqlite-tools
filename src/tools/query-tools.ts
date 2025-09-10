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

// Input validation schemas
const ExecuteQuerySchema = v.object({
	query: v.pipe(v.string(), v.minLength(1)),
	params: v.optional(v.record(v.string(), v.any())),
	database: v.optional(v.string()),
});

const BulkInsertSchema = v.object({
	table: v.pipe(v.string(), v.minLength(1)),
	data: v.array(v.record(v.string(), v.any())),
	batch_size: v.optional(v.number(), 1000),
	database: v.optional(v.string()),
});

/**
 * Register query execution tools with the server
 */
export function register_query_tools(server: McpServer<any>): void {
	server.tool<typeof ExecuteQuerySchema>(
		{
			name: 'execute_read_query',
			description:
				'✓ SAFE: Execute read-only SQL queries (SELECT, PRAGMA, EXPLAIN)',
			schema: ExecuteQuerySchema,
		},
		async ({ query, params = {}, database }) => {
			try {
				debug_log('Executing tool: execute_read_query', {
					query,
					params,
					database,
				});

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				// Validate that this is a read-only query
				if (!sqlite.is_read_only_query(query)) {
					throw new Error(
						'Only SELECT, PRAGMA, and EXPLAIN queries are allowed with execute_read_query',
					);
				}

				const result = sqlite.execute_select_query(
					database_path,
					query,
					params,
				);

				return create_tool_response({
					database: database_path,
					query,
					result,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof ExecuteQuerySchema>(
		{
			name: 'execute_write_query',
			description:
				'⚠️ DESTRUCTIVE: Execute SQL that modifies data (INSERT, UPDATE, DELETE)',
			schema: ExecuteQuerySchema,
		},
		async ({ query, params = {}, database }) => {
			try {
				debug_log('Executing tool: execute_write_query', {
					query,
					params,
					database,
				});

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

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
				'⚠️ SCHEMA CHANGE: Execute DDL queries (CREATE, ALTER, DROP)',
			schema: ExecuteQuerySchema,
		},
		async ({ query, params = {}, database }) => {
			try {
				debug_log('Executing tool: execute_schema_query', {
					query,
					params,
					database,
				});

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				// Validate that this is a schema query
				if (!sqlite.is_schema_query(query)) {
					throw new Error(
						'Only DDL queries (CREATE, ALTER, DROP) are allowed with execute_schema_query',
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
				'⚠️ DESTRUCTIVE: Insert multiple records efficiently in batches',
			schema: BulkInsertSchema,
		},
		async ({ table, data, batch_size = 1000, database }) => {
			try {
				debug_log('Executing tool: bulk_insert', {
					table,
					data_count: data.length,
					batch_size,
					database,
				});

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

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
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);
}
