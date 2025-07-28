/**
 * Unified tool handler for the SQLite Tools MCP server
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as v from 'valibot';
import * as sqlite from '../clients/sqlite.js';
import { resolveDatabaseName, setCurrentDatabase } from './context.js';
import { formatError } from '../common/errors.js';
import { debug_log } from '../config.js';

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
  columns: v.array(v.object({
    name: v.string(),
    type: v.string(),
    nullable: v.optional(v.boolean(), true),
    primary_key: v.optional(v.boolean(), false),
    default_value: v.optional(v.any()),
  })),
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

/**
 * Validate input using Valibot schema
 */
function validateInput<T>(schema: v.BaseSchema<any, T, any>, input: unknown): T {
  try {
    return v.parse(schema, input);
  } catch (error) {
    if (error instanceof v.ValiError) {
      const issues = error.issues
        .map((issue: any) => `${issue.path?.map((p: any) => p.key).join('.')}: ${issue.message}`)
        .join(', ');
      throw new Error(`Validation failed: ${issues}`);
    }
    throw error;
  }
}

/**
 * Register all tools with the server
 */
export function registerTools(server: Server): void {
  // Register the list of available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // Database Management Tools
      {
        name: 'open_database',
        description: '✓ SAFE: Open or create a SQLite database file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the database file (relative to default directory or absolute if allowed)',
            },
            create: {
              type: 'boolean',
              description: 'Create the database if it does not exist (default: true)',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'close_database',
        description: '✓ SAFE: Close a database connection',
        inputSchema: {
          type: 'object',
          properties: {
            database: {
              type: 'string',
              description: 'Database path to close (optional, uses context if not provided)',
            },
          },
          required: [],
        },
      },
      {
        name: 'list_databases',
        description: '✓ SAFE: List available database files in a directory',
        inputSchema: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              description: 'Directory to search for database files (optional, uses default directory)',
            },
          },
          required: [],
        },
      },
      {
        name: 'database_info',
        description: '✓ SAFE: Get information about a database (size, tables, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            database: {
              type: 'string',
              description: 'Database path (optional, uses context if not provided)',
            },
          },
          required: [],
        },
      },

      // Table Operations
      {
        name: 'list_tables',
        description: '✓ SAFE: List all tables and views in a database',
        inputSchema: {
          type: 'object',
          properties: {
            database: {
              type: 'string',
              description: 'Database path (optional, uses context if not provided)',
            },
          },
          required: [],
        },
      },
      {
        name: 'describe_table',
        description: '✓ SAFE: Get schema information for a table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to describe',
            },
            database: {
              type: 'string',
              description: 'Database path (optional, uses context if not provided)',
            },
          },
          required: ['table'],
        },
      },
      {
        name: 'create_table',
        description: '⚠️ SCHEMA CHANGE: Create a new table with specified columns',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Table name',
            },
            columns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Column name' },
                  type: { type: 'string', description: 'SQLite data type (TEXT, INTEGER, REAL, BLOB)' },
                  nullable: { type: 'boolean', description: 'Allow NULL values (default: true)' },
                  primary_key: { type: 'boolean', description: 'Is primary key (default: false)' },
                  default_value: { description: 'Default value for the column' },
                },
                required: ['name', 'type'],
              },
              description: 'Column definitions',
            },
            database: {
              type: 'string',
              description: 'Database path (optional, uses context if not provided)',
            },
          },
          required: ['name', 'columns'],
        },
      },
      {
        name: 'drop_table',
        description: '⚠️ DESTRUCTIVE: Permanently delete a table and all its data',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to delete - WARNING: ALL DATA WILL BE LOST',
            },
            database: {
              type: 'string',
              description: 'Database path (optional, uses context if not provided)',
            },
          },
          required: ['table'],
        },
      },

      // Query Operations
      {
        name: 'execute_read_query',
        description: '✓ SAFE: Execute read-only SQL queries (SELECT, PRAGMA, EXPLAIN)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Read-only SQL query (SELECT, PRAGMA, EXPLAIN only)',
            },
            params: {
              type: 'object',
              description: 'Query parameters for parameterized queries',
            },
            database: {
              type: 'string',
              description: 'Database path (optional, uses context if not provided)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'execute_write_query',
        description: '⚠️ DESTRUCTIVE: Execute SQL that modifies data (INSERT, UPDATE, DELETE)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL query that modifies data - Use with caution',
            },
            params: {
              type: 'object',
              description: 'Query parameters for parameterized queries',
            },
            database: {
              type: 'string',
              description: 'Database path (optional, uses context if not provided)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'execute_schema_query',
        description: '⚠️ SCHEMA CHANGE: Execute DDL queries (CREATE, ALTER, DROP)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'DDL SQL query (CREATE, ALTER, DROP) - Changes database structure',
            },
            params: {
              type: 'object',
              description: 'Query parameters for parameterized queries',
            },
            database: {
              type: 'string',
              description: 'Database path (optional, uses context if not provided)',
            },
          },
          required: ['query'],
        },
      },

      // Database Maintenance
      {
        name: 'backup_database',
        description: '✓ SAFE: Create a backup copy of a database',
        inputSchema: {
          type: 'object',
          properties: {
            source_database: {
              type: 'string',
              description: 'Source database path (optional, uses context if not provided)',
            },
            backup_path: {
              type: 'string',
              description: 'Backup file path (optional, auto-generated if not provided)',
            },
          },
          required: [],
        },
      },
      {
        name: 'vacuum_database',
        description: '✓ MAINTENANCE: Optimize database storage by reclaiming unused space',
        inputSchema: {
          type: 'object',
          properties: {
            database: {
              type: 'string',
              description: 'Database path (optional, uses context if not provided)',
            },
          },
          required: [],
        },
      },
    ],
  }));

  // Register the unified tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      debug_log('Executing tool:', request.params.name, request.params.arguments);

      // Database Management Tools
      if (request.params.name === 'open_database') {
        const { path, create } = validateInput(OpenDatabaseSchema, request.params.arguments);
        
        const db = sqlite.openDatabase(path, create);
        setCurrentDatabase(path);
        
        const info = sqlite.getDatabaseInfo(path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Database opened: ${path}`,
                database: info,
              }, null, 2),
            },
          ],
        };
      }

      if (request.params.name === 'close_database') {
        const { database } = request.params.arguments as { database?: string };
        const databasePath = resolveDatabaseName(database);
        
        sqlite.closeDatabase(databasePath);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Database closed: ${databasePath}`,
              }, null, 2),
            },
          ],
        };
      }

      if (request.params.name === 'list_databases') {
        const { directory } = validateInput(ListDatabasesSchema, request.params.arguments);
        
        // This would need to be implemented to scan for .db files
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                message: 'List databases functionality needs to be implemented',
                directory: directory || 'default',
              }, null, 2),
            },
          ],
        };
      }

      if (request.params.name === 'database_info') {
        const { database } = request.params.arguments as { database?: string };
        const databasePath = resolveDatabaseName(database);
        
        const info = sqlite.getDatabaseInfo(databasePath);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                database: databasePath,
                info,
              }, null, 2),
            },
          ],
        };
      }

      // Table Operations
      if (request.params.name === 'list_tables') {
        const { database } = request.params.arguments as { database?: string };
        const databasePath = resolveDatabaseName(database);
        
        if (database) setCurrentDatabase(database);
        
        const tables = sqlite.listTables(databasePath);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                database: databasePath,
                tables,
              }, null, 2),
            },
          ],
        };
      }

      if (request.params.name === 'describe_table') {
        const { table, database } = validateInput(DescribeTableSchema, request.params.arguments);
        const databasePath = resolveDatabaseName(database);
        
        if (database) setCurrentDatabase(database);
        
        const columns = sqlite.describeTable(databasePath, table);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                database: databasePath,
                table,
                columns: columns.map((col) => ({
                  name: col.name,
                  type: col.type,
                  nullable: col.notnull === 0,
                  default_value: col.dflt_value,
                  primary_key: col.pk === 1,
                })),
              }, null, 2),
            },
          ],
        };
      }

      if (request.params.name === 'create_table') {
        const { name, columns, database } = validateInput(CreateTableSchema, request.params.arguments);
        const databasePath = resolveDatabaseName(database);
        
        if (database) setCurrentDatabase(database);
        
        // Build CREATE TABLE SQL
        const columnDefs = columns.map((col) => {
          let def = `${col.name} ${col.type}`;
          if (col.primary_key) def += ' PRIMARY KEY';
          if (!col.nullable) def += ' NOT NULL';
          if (col.default_value !== undefined) def += ` DEFAULT ${col.default_value}`;
          return def;
        }).join(', ');
        
        const createSql = `CREATE TABLE ${name} (${columnDefs})`;
        const result = sqlite.executeQuery(databasePath, createSql);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                database: databasePath,
                table: name,
                query: createSql,
                result,
              }, null, 2),
            },
          ],
        };
      }

      if (request.params.name === 'drop_table') {
        const { table, database } = request.params.arguments as { table: string; database?: string };
        const databasePath = resolveDatabaseName(database);
        
        if (database) setCurrentDatabase(database);
        
        const dropSql = `DROP TABLE ${table}`;
        const result = sqlite.executeQuery(databasePath, dropSql);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                database: databasePath,
                table,
                query: dropSql,
                result,
              }, null, 2),
            },
          ],
        };
      }

      // Query Operations
      if (request.params.name === 'execute_read_query') {
        const { query, params = {}, database } = validateInput(ExecuteQuerySchema, request.params.arguments);
        const databasePath = resolveDatabaseName(database);
        
        if (database) setCurrentDatabase(database);
        
        // Validate that this is a read-only query
        if (!sqlite.isReadOnlyQuery(query)) {
          throw new Error('Only SELECT, PRAGMA, and EXPLAIN queries are allowed with execute_read_query');
        }
        
        const result = sqlite.executeSelectQuery(databasePath, query, params);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                database: databasePath,
                query,
                result,
              }, null, 2),
            },
          ],
        };
      }

      if (request.params.name === 'execute_write_query') {
        const { query, params = {}, database } = validateInput(ExecuteQuerySchema, request.params.arguments);
        const databasePath = resolveDatabaseName(database);
        
        if (database) setCurrentDatabase(database);
        
        // Validate that this is not a read-only query and not a schema query
        if (sqlite.isReadOnlyQuery(query)) {
          throw new Error('SELECT, PRAGMA, and EXPLAIN queries should use execute_read_query');
        }
        if (sqlite.isSchemaQuery(query)) {
          throw new Error('DDL queries (CREATE, ALTER, DROP) should use execute_schema_query');
        }
        
        const result = sqlite.executeQuery(databasePath, query, params);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                database: databasePath,
                query,
                result,
              }, null, 2),
            },
          ],
        };
      }

      if (request.params.name === 'execute_schema_query') {
        const { query, params = {}, database } = validateInput(ExecuteQuerySchema, request.params.arguments);
        const databasePath = resolveDatabaseName(database);
        
        if (database) setCurrentDatabase(database);
        
        // Validate that this is a schema query
        if (!sqlite.isSchemaQuery(query)) {
          throw new Error('Only DDL queries (CREATE, ALTER, DROP) are allowed with execute_schema_query');
        }
        
        const result = sqlite.executeQuery(databasePath, query, params);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                database: databasePath,
                query,
                result,
              }, null, 2),
            },
          ],
        };
      }

      // Database Maintenance
      if (request.params.name === 'backup_database') {
        const { source_database, backup_path } = validateInput(BackupDatabaseSchema, request.params.arguments);
        const sourcePath = resolveDatabaseName(source_database);
        
        const backupInfo = sqlite.backupDatabase(sourcePath, backup_path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                backup: backupInfo,
              }, null, 2),
            },
          ],
        };
      }

      if (request.params.name === 'vacuum_database') {
        const { database } = request.params.arguments as { database?: string };
        const databasePath = resolveDatabaseName(database);
        
        sqlite.vacuumDatabase(databasePath);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                database: databasePath,
                message: 'Database vacuumed successfully',
              }, null, 2),
            },
          ],
        };
      }

      // If we get here, it's not a recognized tool
      throw new Error(`Unknown tool: ${request.params.name}`);
    } catch (error) {
      console.error('Error executing tool:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${formatError(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
