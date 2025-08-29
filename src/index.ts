#!/usr/bin/env node

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
					// Declare support for tools - actual tool definitions are registered
					// dynamically in src/tools/handler.ts using setRequestHandler()
					tools: {},
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
