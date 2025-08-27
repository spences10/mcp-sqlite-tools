import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeAllDatabases } from './clients/sqlite.js';
import { get_config } from './config.js';
import { registerTools } from './tools/handler.js';

// Get package info for server metadata
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);
const { name, version } = pkg;

/**
 * Main class for the SQLite Tools MCP server
 */
class SqliteToolsServer {
	private server: Server;

	constructor() {
		// Initialize the server with metadata
		this.server = new Server(
			{
				name,
				version,
			},
			{
				capabilities: {
					resources: {},
					tools: {
						// Database Management
						open_database: {
							description: 'Open or create a SQLite database file',
							parameters: {
								type: 'object',
								properties: {
									path: {
										type: 'string',
										description:
											'Path to the database file (relative to default directory or absolute if allowed)',
									},
									create: {
										type: 'boolean',
										description:
											'Create the database if it does not exist (default: true)',
									},
								},
								required: ['path'],
							},
						},
						close_database: {
							description: 'Close a database connection',
							parameters: {
								type: 'object',
								properties: {
									database: {
										type: 'string',
										description:
											'Database path to close (optional, uses context if not provided)',
									},
								},
								required: [],
							},
						},
						list_databases: {
							description:
								'List available database files in a directory',
							parameters: {
								type: 'object',
								properties: {
									directory: {
										type: 'string',
										description:
											'Directory to search for database files (optional, uses default directory)',
									},
								},
								required: [],
							},
						},
						database_info: {
							description: 'Get information about a database',
							parameters: {
								type: 'object',
								properties: {
									database: {
										type: 'string',
										description:
											'Database path (optional, uses context if not provided)',
									},
								},
								required: [],
							},
						},

						// Table Operations
						list_tables: {
							description: 'List all tables and views in a database',
							parameters: {
								type: 'object',
								properties: {
									database: {
										type: 'string',
										description:
											'Database path (optional, uses context if not provided)',
									},
								},
								required: [],
							},
						},
						describe_table: {
							description: 'Get schema information for a table',
							parameters: {
								type: 'object',
								properties: {
									table: {
										type: 'string',
										description: 'Table name to describe',
									},
									database: {
										type: 'string',
										description:
											'Database path (optional, uses context if not provided)',
									},
								},
								required: ['table'],
							},
						},
						create_table: {
							description:
								'Create a new table with specified columns',
							parameters: {
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
												name: {
													type: 'string',
													description: 'Column name',
												},
												type: {
													type: 'string',
													description:
														'SQLite data type (TEXT, INTEGER, REAL, BLOB)',
												},
												nullable: {
													type: 'boolean',
													description:
														'Allow NULL values (default: true)',
												},
												primary_key: {
													type: 'boolean',
													description:
														'Is primary key (default: false)',
												},
												default_value: {
													description: 'Default value for the column',
												},
											},
											required: ['name', 'type'],
										},
										description: 'Column definitions',
									},
									database: {
										type: 'string',
										description:
											'Database path (optional, uses context if not provided)',
									},
								},
								required: ['name', 'columns'],
							},
						},
						drop_table: {
							description:
								'Permanently delete a table and all its data',
							parameters: {
								type: 'object',
								properties: {
									table: {
										type: 'string',
										description:
											'Table name to delete - WARNING: ALL DATA WILL BE LOST',
									},
									database: {
										type: 'string',
										description:
											'Database path (optional, uses context if not provided)',
									},
								},
								required: ['table'],
							},
						},

						// Query Operations
						execute_read_query: {
							description:
								'Execute read-only SQL queries (SELECT, PRAGMA, EXPLAIN)',
							parameters: {
								type: 'object',
								properties: {
									query: {
										type: 'string',
										description:
											'Read-only SQL query (SELECT, PRAGMA, EXPLAIN only)',
									},
									params: {
										type: 'object',
										description:
											'Query parameters for parameterized queries',
									},
									database: {
										type: 'string',
										description:
											'Database path (optional, uses context if not provided)',
									},
								},
								required: ['query'],
							},
						},
						execute_write_query: {
							description:
								'Execute SQL that modifies data (INSERT, UPDATE, DELETE)',
							parameters: {
								type: 'object',
								properties: {
									query: {
										type: 'string',
										description:
											'SQL query that modifies data - Use with caution',
									},
									params: {
										type: 'object',
										description:
											'Query parameters for parameterized queries',
									},
									database: {
										type: 'string',
										description:
											'Database path (optional, uses context if not provided)',
									},
								},
								required: ['query'],
							},
						},
						execute_schema_query: {
							description:
								'Execute DDL queries (CREATE, ALTER, DROP)',
							parameters: {
								type: 'object',
								properties: {
									query: {
										type: 'string',
										description:
											'DDL SQL query (CREATE, ALTER, DROP) - Changes database structure',
									},
									params: {
										type: 'object',
										description:
											'Query parameters for parameterized queries',
									},
									database: {
										type: 'string',
										description:
											'Database path (optional, uses context if not provided)',
									},
								},
								required: ['query'],
							},
						},

						// Database Maintenance
						backup_database: {
							description: 'Create a backup copy of a database',
							parameters: {
								type: 'object',
								properties: {
									source_database: {
										type: 'string',
										description:
											'Source database path (optional, uses context if not provided)',
									},
									backup_path: {
										type: 'string',
										description:
											'Backup file path (optional, auto-generated if not provided)',
									},
								},
								required: [],
							},
						},
						vacuum_database: {
							description:
								'Optimize database storage by reclaiming unused space',
							parameters: {
								type: 'object',
								properties: {
									database: {
										type: 'string',
										description:
											'Database path (optional, uses context if not provided)',
									},
								},
								required: [],
							},
						},
					},
				},
			},
		);

		// Set up error handling
		this.server.onerror = (error) => {
			console.error('[MCP Error]', error);
		};

		// Handle process termination
		process.on('SIGINT', async () => {
			await this.cleanup();
			process.exit(0);
		});

		process.on('SIGTERM', async () => {
			await this.cleanup();
			process.exit(0);
		});

		process.on('exit', () => {
			this.cleanup();
		});
	}

	/**
	 * Cleanup resources
	 */
	private async cleanup(): Promise<void> {
		try {
			// Close all database connections
			closeAllDatabases();

			// Close the server
			await this.server.close();

			console.error('SQLite Tools MCP server shutdown complete');
		} catch (error) {
			console.error('Error during cleanup:', error);
		}
	}

	/**
	 * Initialize the server
	 */
	private async initialize(): Promise<void> {
		try {
			// Load configuration
			const config = get_config();
			console.error(
				`SQLite Tools MCP server initialized with default path: ${config.SQLITE_DEFAULT_PATH}`,
			);

			// Register all tools using the unified handler
			registerTools(this.server);

			console.error('All tools registered');
		} catch (error) {
			console.error('Failed to initialize server:', error);
			process.exit(1);
		}
	}

	/**
	 * Run the server
	 */
	public async run(): Promise<void> {
		try {
			// Initialize the server
			await this.initialize();

			// Connect to the transport
			const transport = new StdioServerTransport();
			await this.server.connect(transport);

			console.error('SQLite Tools MCP server running on stdio');
		} catch (error) {
			console.error('Failed to start server:', error);
			process.exit(1);
		}
	}
}

// Create and run the server
const server = new SqliteToolsServer();
server.run().catch((error) => {
	console.error('Unhandled error:', error);
	process.exit(1);
});
