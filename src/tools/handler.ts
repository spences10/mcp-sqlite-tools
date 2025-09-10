/**
 * Unified tool handler for the SQLite Tools MCP server
 */
import { McpServer } from 'tmcp';
import * as v from 'valibot';
import * as sqlite from '../clients/sqlite.js';
import { formatError } from '../common/errors.js';
import { debug_log } from '../config.js';
import {
	resolveDatabaseName,
	setCurrentDatabase,
} from './context.js';

/**
 * Helper to create consistent tool responses
 */
function createResponse(data: any) {
	return {
		content: [
			{
				type: 'text' as const,
				text: JSON.stringify(data, null, 2),
			},
		],
	};
}

/**
 * Helper to create consistent error responses
 */
function createErrorResponse(error: unknown) {
	return {
		content: [
			{
				type: 'text' as const,
				text: JSON.stringify(
					{
						error: 'execution_error',
						message: formatError(error),
					},
					null,
					2,
				),
			},
		],
		isError: true,
	};
}

/**
 * Helper to handle database context setup
 */
function setupDatabaseContext(database?: string) {
	const databasePath = resolveDatabaseName(database);
	if (database) setCurrentDatabase(database);
	return databasePath;
}

// Input validation schemas
const OpenDatabaseSchema = v.object({
	path: v.pipe(v.string(), v.minLength(1)),
	create: v.optional(v.boolean(), true),
});

const ExecuteQuerySchema = v.object({
	query: v.pipe(v.string(), v.minLength(1)),
	params: v.optional(v.record(v.string(), v.any())),
	database: v.optional(v.string()),
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
 * Register all tools with the server
 */
export function registerTools(server: McpServer<any>): void {
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

				const db = sqlite.openDatabase(path, create);
				setCurrentDatabase(path);

				const info = sqlite.getDatabaseInfo(path);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									success: true,
									message: `Database opened: ${path}`,
									database: info,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
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

				const databasePath = setupDatabaseContext(database);
				sqlite.closeDatabase(databasePath);

				return createResponse({
					success: true,
					message: `Database closed: ${databasePath}`,
				});
			} catch (error) {
				return createErrorResponse(error);
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

				const databases = sqlite.listDatabaseFiles(directory);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									directory: directory || 'default',
									databases,
									count: databases.length,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
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

				const databasePath = setupDatabaseContext(database);
				const info = sqlite.getDatabaseInfo(databasePath);

				return createResponse({
					database: databasePath,
					info,
				});
			} catch (error) {
				return createErrorResponse(error);
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

				const databasePath = resolveDatabaseName(database);
				if (database) setCurrentDatabase(database);

				const tables = sqlite.listTables(databasePath);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									database: databasePath,
									tables,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
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

				const databasePath = resolveDatabaseName(database);
				if (database) setCurrentDatabase(database);

				const columns = sqlite.describeTable(databasePath, table);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									database: databasePath,
									table,
									columns: columns.map((col) => ({
										name: col.name,
										type: col.type,
										nullable: col.notnull === 0,
										default_value: col.dflt_value,
										primary_key: col.pk === 1,
									})),
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
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

				const databasePath = resolveDatabaseName(database);
				if (database) setCurrentDatabase(database);

				// Build CREATE TABLE SQL
				const columnDefs = columns
					.map((col) => {
						let def = `${col.name} ${col.type}`;
						if (col.primary_key) def += ' PRIMARY KEY';
						if (!col.nullable) def += ' NOT NULL';
						if (col.default_value !== undefined)
							def += ` DEFAULT ${col.default_value}`;
						return def;
					})
					.join(', ');

				const createSql = `CREATE TABLE ${name} (${columnDefs})`;
				const result = sqlite.executeQuery(databasePath, createSql);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									success: true,
									database: databasePath,
									table: name,
									query: createSql,
									result,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
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

				const databasePath = resolveDatabaseName(database);
				if (database) setCurrentDatabase(database);

				const dropSql = `DROP TABLE ${table}`;
				const result = sqlite.executeQuery(databasePath, dropSql);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									success: true,
									database: databasePath,
									table,
									query: dropSql,
									result,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);

	// Query Operations
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

				const databasePath = resolveDatabaseName(database);
				if (database) setCurrentDatabase(database);

				// Validate that this is a read-only query
				if (!sqlite.isReadOnlyQuery(query)) {
					throw new Error(
						'Only SELECT, PRAGMA, and EXPLAIN queries are allowed with execute_read_query',
					);
				}

				const result = sqlite.executeSelectQuery(
					databasePath,
					query,
					params,
				);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									database: databasePath,
									query,
									result,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
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

				const databasePath = resolveDatabaseName(database);
				if (database) setCurrentDatabase(database);

				// Validate that this is not a read-only query and not a schema query
				if (sqlite.isReadOnlyQuery(query)) {
					throw new Error(
						'SELECT, PRAGMA, and EXPLAIN queries should use execute_read_query',
					);
				}
				if (sqlite.isSchemaQuery(query)) {
					throw new Error(
						'DDL queries (CREATE, ALTER, DROP) should use execute_schema_query',
					);
				}

				const result = sqlite.executeQuery(
					databasePath,
					query,
					params,
				);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									database: databasePath,
									query,
									result,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
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

				const databasePath = resolveDatabaseName(database);
				if (database) setCurrentDatabase(database);

				// Validate that this is a schema query
				if (!sqlite.isSchemaQuery(query)) {
					throw new Error(
						'Only DDL queries (CREATE, ALTER, DROP) are allowed with execute_schema_query',
					);
				}

				const result = sqlite.executeQuery(
					databasePath,
					query,
					params,
				);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									database: databasePath,
									query,
									result,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
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

				const sourcePath = resolveDatabaseName(source_database);

				const backupInfo = sqlite.backupDatabase(
					sourcePath,
					backup_path,
				);

				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									success: true,
									backup: backupInfo,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(
								{
									error: 'execution_error',
									message: formatError(error),
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
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

				const databasePath = setupDatabaseContext(database);
				sqlite.vacuumDatabase(databasePath);

				return createResponse({
					success: true,
					database: databasePath,
					message: 'Database vacuumed successfully',
				});
			} catch (error) {
				return createErrorResponse(error);
			}
		},
	);
}
