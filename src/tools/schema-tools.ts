/**
 * Schema export/import tools for the SQLite Tools MCP server
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
const ExportSchemaSchema = v.object({
	database: v.optional(v.string()),
	format: v.optional(
		v.union([v.literal('sql'), v.literal('json')]),
		'sql',
	),
	tables: v.optional(v.array(v.string())),
});

const ImportSchemaSchema = v.object({
	database: v.optional(v.string()),
	schema: v.pipe(v.string(), v.minLength(1)),
	format: v.optional(
		v.union([v.literal('sql'), v.literal('json')]),
		'sql',
	),
});

/**
 * Register schema management tools with the server
 */
export function register_schema_tools(server: McpServer<any>): void {
	server.tool<typeof ExportSchemaSchema>(
		{
			name: 'export_schema',
			description: '✓ SAFE: Export database schema as SQL or JSON',
			schema: ExportSchemaSchema,
		},
		async ({ database, format = 'sql', tables }) => {
			try {
				debug_log('Executing tool: export_schema', {
					database,
					format,
					tables,
				});

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				const result = sqlite.export_schema(
					database_path,
					format,
					tables,
				);

				return create_tool_response({
					success: true,
					database: database_path,
					format,
					tables_exported: result.tables_count,
					schema: result.schema,
					size: result.schema.length,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof ImportSchemaSchema>(
		{
			name: 'import_schema',
			description:
				'⚠️ SCHEMA CHANGE: Import and execute schema from SQL or JSON',
			schema: ImportSchemaSchema,
		},
		async ({ database, schema, format = 'sql' }) => {
			try {
				debug_log('Executing tool: import_schema', {
					database,
					format,
					schema_size: schema.length,
				});

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				const result = sqlite.import_schema(
					database_path,
					schema,
					format,
				);

				return create_tool_response({
					success: true,
					database: database_path,
					format,
					statements_executed: result.statements_executed,
					tables_created: result.tables_created,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);
}
