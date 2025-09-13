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
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
	format: v.optional(
		v.union([v.literal('sql'), v.literal('json')]),
		'sql',
	),
	tables: v.optional(
		v.pipe(
			v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
			v.maxLength(100),
		),
	),
});

const ImportSchemaSchema = v.object({
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
	schema: v.pipe(v.string(), v.minLength(1), v.maxLength(100000)),
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
			description:
				'✓ SAFE: Export database schema as SQL DDL statements or structured JSON. Includes table definitions, indexes, views, and triggers. Can export specific tables or entire database. SQL format is suitable for recreation, JSON format for analysis and documentation.',
			schema: ExportSchemaSchema,
		},
		async ({ database_name, format = 'sql', tables }) => {
			try {
				debug_log('Executing tool: export_schema', {
					database_name,
					format,
					tables,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

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
					message: `✅ SCHEMA EXPORTED: ${result.tables_count} tables exported from database '${database_path}' in ${format.toUpperCase()} format`,
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
				'⚠️ SCHEMA CHANGE: Import and execute schema from SQL DDL statements or JSON structure. Creates tables, indexes, views, and triggers as defined in the schema. Will fail if objects already exist unless using IF NOT EXISTS clauses. Validate schema before importing.',
			schema: ImportSchemaSchema,
		},
		async ({ database_name, schema, format = 'sql' }) => {
			try {
				debug_log('Executing tool: import_schema', {
					database_name,
					format,
					schema_size: schema.length,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

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
					message: `⚠️ SCHEMA IMPORT COMPLETED: ${result.statements_executed} statements executed, ${result.tables_created} tables created in database '${database_path}'`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);
}
