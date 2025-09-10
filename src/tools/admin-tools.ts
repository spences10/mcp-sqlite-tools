/**
 * Database administration tools for the SQLite Tools MCP server
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

/**
 * Helper to handle database context setup
 */
function setup_database_context(database?: string) {
	const database_path = resolve_database_name(database);
	if (database) set_current_database(database);
	return database_path;
}

// Input validation schemas
const OpenDatabaseSchema = v.object({
	path: v.pipe(v.string(), v.minLength(1)),
	create: v.optional(v.boolean(), true),
});

const CreateTableSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1)),
	columns: v.array(
		v.object({
			name: v.string(),
			type: v.string(),
			nullable: v.optional(v.boolean(), true),
			primary_key: v.optional(v.boolean(), false),
			default_value: v.optional(v.any()),
		}),
	),
	database: v.optional(v.string()),
});

const DescribeTableSchema = v.object({
	table: v.pipe(v.string(), v.minLength(1)),
	database: v.optional(v.string()),
});

const BackupDatabaseSchema = v.object({
	source_database: v.optional(v.string()),
	backup_path: v.optional(v.string()),
});

const ListDatabasesSchema = v.object({
	directory: v.optional(v.string()),
});

const DatabaseOnlySchema = v.object({
	database: v.optional(v.string()),
});

const DropTableSchema = v.object({
	table: v.pipe(v.string(), v.minLength(1)),
	database: v.optional(v.string()),
});

/**
 * Register database administration tools with the server
 */
export function register_admin_tools(server: McpServer<any>): void {
	// Database Management Tools
	server.tool<typeof OpenDatabaseSchema>(
		{
			name: 'open_database',
			description: '✓ SAFE: Open or create a SQLite database file',
			schema: OpenDatabaseSchema,
		},
		async ({ path, create }) => {
			try {
				debug_log('Executing tool: open_database', { path, create });

				set_current_database(path);

				const info = sqlite.get_database_info(path);

				return create_tool_response({
					success: true,
					message: `Database opened: ${path}`,
					database: info,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof DatabaseOnlySchema>(
		{
			name: 'close_database',
			description: '✓ SAFE: Close a database connection',
			schema: DatabaseOnlySchema,
		},
		async ({ database }) => {
			try {
				debug_log('Executing tool: close_database', { database });

				const database_path = setup_database_context(database);
				sqlite.close_database(database_path);

				return create_tool_response({
					success: true,
					message: `Database closed: ${database_path}`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof ListDatabasesSchema>(
		{
			name: 'list_databases',
			description:
				'✓ SAFE: List available database files in a directory',
			schema: ListDatabasesSchema,
		},
		async ({ directory }) => {
			try {
				debug_log('Executing tool: list_databases', { directory });

				const databases = sqlite.list_database_files(directory);

				return create_tool_response({
					directory: directory || 'default',
					databases,
					count: databases.length,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof DatabaseOnlySchema>(
		{
			name: 'database_info',
			description:
				'✓ SAFE: Get information about a database (size, tables, etc.)',
			schema: DatabaseOnlySchema,
		},
		async ({ database }) => {
			try {
				debug_log('Executing tool: database_info', { database });

				const database_path = setup_database_context(database);
				const info = sqlite.get_database_info(database_path);

				return create_tool_response({
					database: database_path,
					info,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	// Table Operations
	server.tool<typeof DatabaseOnlySchema>(
		{
			name: 'list_tables',
			description: '✓ SAFE: List all tables and views in a database',
			schema: DatabaseOnlySchema,
		},
		async ({ database }) => {
			try {
				debug_log('Executing tool: list_tables', { database });

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				const tables = sqlite.list_tables(database_path);

				return create_tool_response({
					database: database_path,
					tables,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof DescribeTableSchema>(
		{
			name: 'describe_table',
			description: '✓ SAFE: Get schema information for a table',
			schema: DescribeTableSchema,
		},
		async ({ table, database }) => {
			try {
				debug_log('Executing tool: describe_table', {
					table,
					database,
				});

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				const columns = sqlite.describe_table(database_path, table);

				return create_tool_response({
					database: database_path,
					table,
					columns: columns.map((col) => ({
						name: col.name,
						type: col.type,
						nullable: col.notnull === 0,
						default_value: col.dflt_value,
						primary_key: col.pk === 1,
					})),
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof CreateTableSchema>(
		{
			name: 'create_table',
			description:
				'⚠️ SCHEMA CHANGE: Create a new table with specified columns',
			schema: CreateTableSchema,
		},
		async ({ name, columns, database }) => {
			try {
				debug_log('Executing tool: create_table', {
					name,
					columns,
					database,
				});

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				// Build CREATE TABLE SQL
				const column_defs = columns
					.map((col) => {
						let def = `${col.name} ${col.type}`;
						if (col.primary_key) def += ' PRIMARY KEY';
						if (!col.nullable) def += ' NOT NULL';
						if (col.default_value !== undefined)
							def += ` DEFAULT ${col.default_value}`;
						return def;
					})
					.join(', ');

				const create_sql = `CREATE TABLE ${name} (${column_defs})`;
				const result = sqlite.execute_query(
					database_path,
					create_sql,
				);

				return create_tool_response({
					success: true,
					database: database_path,
					table: name,
					query: create_sql,
					result,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof DropTableSchema>(
		{
			name: 'drop_table',
			description:
				'⚠️ DESTRUCTIVE: Permanently delete a table and all its data',
			schema: DropTableSchema,
		},
		async ({ table, database }) => {
			try {
				debug_log('Executing tool: drop_table', { table, database });

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				const drop_sql = `DROP TABLE ${table}`;
				const result = sqlite.execute_query(database_path, drop_sql);

				return create_tool_response({
					success: true,
					database: database_path,
					table,
					query: drop_sql,
					result,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	// Database Maintenance
	server.tool<typeof BackupDatabaseSchema>(
		{
			name: 'backup_database',
			description: '✓ SAFE: Create a backup copy of a database',
			schema: BackupDatabaseSchema,
		},
		async ({ source_database, backup_path }) => {
			try {
				debug_log('Executing tool: backup_database', {
					source_database,
					backup_path,
				});

				const source_path = resolve_database_name(source_database);

				const backup_info = sqlite.backup_database(
					source_path,
					backup_path,
				);

				return create_tool_response({
					success: true,
					backup: backup_info,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof DatabaseOnlySchema>(
		{
			name: 'vacuum_database',
			description:
				'✓ MAINTENANCE: Optimize database storage by reclaiming unused space',
			schema: DatabaseOnlySchema,
		},
		async ({ database }) => {
			try {
				debug_log('Executing tool: vacuum_database', { database });

				const database_path = setup_database_context(database);
				sqlite.vacuum_database(database_path);

				return create_tool_response({
					success: true,
					database: database_path,
					message: 'Database vacuumed successfully',
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);
}
