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
	path: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
	create: v.optional(v.boolean(), true),
});

// Valid SQLite column types
const SQLiteColumnType = v.union([
	v.literal('TEXT'),
	v.literal('INTEGER'),
	v.literal('REAL'),
	v.literal('BLOB'),
	v.literal('NUMERIC'),
	v.literal('VARCHAR'),
	v.literal('CHAR'),
	v.literal('DATE'),
	v.literal('DATETIME'),
	v.literal('TIMESTAMP'),
	v.literal('BOOLEAN'),
]);

// Valid SQLite default values
const SQLiteDefaultValue = v.union([
	v.string(),
	v.number(),
	v.boolean(),
	v.null(),
	v.literal('CURRENT_TIME'),
	v.literal('CURRENT_DATE'),
	v.literal('CURRENT_TIMESTAMP'),
]);

const CreateTableSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	columns: v.pipe(
		v.array(
			v.object({
				name: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
				type: SQLiteColumnType,
				nullable: v.optional(v.boolean(), true),
				primary_key: v.optional(v.boolean(), false),
				default_value: v.optional(SQLiteDefaultValue),
			}),
		),
		v.minLength(1),
		v.maxLength(100),
	),
	database_name: v.optional(v.string()),
});

const DescribeTableSchema = v.object({
	table: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
	verbosity: v.optional(
		v.union([v.literal('summary'), v.literal('detailed')]),
		'detailed',
	),
});

const BackupDatabaseSchema = v.object({
	source_database_name: v.optional(
		v.pipe(v.string(), v.maxLength(255)),
	),
	backup_path: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

const ListDatabasesSchema = v.object({
	directory: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

const DatabaseOnlySchema = v.object({
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
});

const DatabaseWithVerbositySchema = v.object({
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
	verbosity: v.optional(
		v.union([v.literal('summary'), v.literal('detailed')]),
		'summary',
	),
});

const DatabaseWithPaginationSchema = v.object({
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
	verbosity: v.optional(
		v.union([v.literal('summary'), v.literal('detailed')]),
		'summary',
	),
	limit: v.optional(
		v.pipe(v.number(), v.minValue(1), v.maxValue(1000)),
		1000,
	),
	offset: v.optional(
		v.pipe(v.number(), v.minValue(0), v.maxValue(100000)),
		0,
	),
});

const DropTableSchema = v.object({
	table: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
});

/**
 * Register database administration tools with the server
 */
export function register_admin_tools(server: McpServer<any>): void {
	// Database Management Tools
	server.tool<typeof OpenDatabaseSchema>(
		{
			name: 'open_database',
			description:
				'✓ SAFE: Open/create database file. Sets as current context. Returns database info.',
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
			description:
				"✓ SAFE: Close database connection and free resources. Doesn't affect file.",
			schema: DatabaseOnlySchema,
		},
		async ({ database_name }) => {
			try {
				debug_log('Executing tool: close_database', {
					database_name,
				});

				const database_path = setup_database_context(database_name);
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
				'✓ SAFE: List .db/.sqlite/.sqlite3 files in directory. Returns paths, sizes, dates. Max 100 results.',
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
				'✓ SAFE: Get database info (size, table/index counts, statistics). Metadata only, no data.',
			schema: DatabaseOnlySchema,
		},
		async ({ database_name }) => {
			try {
				debug_log('Executing tool: database_info', { database_name });

				const database_path = setup_database_context(database_name);
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
	server.tool<typeof DatabaseWithPaginationSchema>(
		{
			name: 'list_tables',
			description:
				'✓ SAFE: List tables/views with types and row counts. Supports pagination (max 1000). Use verbosity="summary" for names only.',
			schema: DatabaseWithPaginationSchema,
		},
		async ({
			database_name,
			verbosity = 'summary',
			limit = 1000,
			offset = 0,
		}) => {
			try {
				debug_log('Executing tool: list_tables', {
					database_name,
					verbosity,
					limit,
					offset,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				const all_tables = sqlite.list_tables(database_path);

				// Apply pagination
				const paginated_tables = all_tables.slice(
					offset,
					offset + limit,
				);

				// Format output based on verbosity
				const formatted_tables =
					verbosity === 'summary'
						? paginated_tables.map((table) => ({
								name: table.name,
								type: table.type,
							}))
						: paginated_tables;

				return create_tool_response({
					database: database_path,
					tables: formatted_tables,
					verbosity,
					pagination: {
						limit,
						offset,
						total_count: all_tables.length,
						returned_count: paginated_tables.length,
						has_more: offset + limit < all_tables.length,
					},
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof DescribeTableSchema>(
		{
			name: 'describe_table',
			description:
				'✓ SAFE: Get table schema (columns, types, constraints, indexes, keys, defaults, nullability).',
			schema: DescribeTableSchema,
		},
		async ({ table, database_name, verbosity = 'detailed' }) => {
			try {
				debug_log('Executing tool: describe_table', {
					table,
					database_name,
					verbosity,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				const columns = sqlite.describe_table(database_path, table);

				// Format columns based on verbosity
				const formatted_columns =
					verbosity === 'summary'
						? columns.map((col) => ({
								name: col.name,
								type: col.type,
							}))
						: columns.map((col) => ({
								name: col.name,
								type: col.type,
								nullable: col.notnull === 0,
								default_value: col.dflt_value,
								primary_key: col.pk === 1,
							}));

				return create_tool_response({
					database: database_path,
					table,
					columns: formatted_columns,
					verbosity,
					column_count: columns.length,
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
				'⚠️ SCHEMA CHANGE: Create table with columns and constraints. Supports primary keys, defaults, NOT NULL. Fails if exists.',
			schema: CreateTableSchema,
		},
		async ({ name, columns, database_name }) => {
			try {
				debug_log('Executing tool: create_table', {
					name,
					columns,
					database_name,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

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
					message: `✅ SCHEMA CHANGE COMPLETED: Table '${name}' created in database '${database_path}'`,
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
				'⚠️ DESTRUCTIVE: Permanently delete table and all data. Cannot be undone. Removes structure, rows, indexes, triggers.',
			schema: DropTableSchema,
		},
		async ({ table, database_name }) => {
			try {
				debug_log('Executing tool: drop_table', {
					table,
					database_name,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				const drop_sql = `DROP TABLE ${table}`;
				const result = sqlite.execute_query(database_path, drop_sql);

				return create_tool_response({
					success: true,
					database: database_path,
					table,
					query: drop_sql,
					result,
					message: `⚠️ DESTRUCTIVE OPERATION COMPLETED: Table '${table}' permanently deleted from database '${database_path}'`,
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
			description:
				'✓ SAFE: Create complete backup copy. Copies all tables, data, indexes, schema. Auto-timestamps if no path specified.',
			schema: BackupDatabaseSchema,
		},
		async ({ source_database_name, backup_path }) => {
			try {
				debug_log('Executing tool: backup_database', {
					source_database_name,
					backup_path,
				});

				const source_path = resolve_database_name(
					source_database_name,
				);

				const backup_info = sqlite.backup_database(
					source_path,
					backup_path,
				);

				return create_tool_response({
					success: true,
					source_database: source_path,
					backup: backup_info,
					message: `✅ Database backup completed: ${source_path} → ${backup_info.destination}`,
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
				'✓ MAINTENANCE: Optimize storage by reclaiming space and defragmenting. Requires free space equal to database size.',
			schema: DatabaseOnlySchema,
		},
		async ({ database_name }) => {
			try {
				debug_log('Executing tool: vacuum_database', {
					database_name,
				});

				const database_path = setup_database_context(database_name);
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
