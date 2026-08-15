#!/usr/bin/env node

import { StdioTransport } from '@tmcp/transport-stdio';
import { McpServer } from 'tmcp';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	start_connection_maintenance,
	stop_connection_maintenance,
} from './clients/connection-manager.js';
import { close_all_databases } from './clients/sqlite.js';
import { get_config } from './config.js';
import { create_mcp_server } from './mcp-server.js';

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
	private server: McpServer<any>;

	constructor() {
		this.server = create_mcp_server({
			name,
			version,
			description: 'MCP server for local SQLite database operations',
		});

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
			void this.cleanup();
		});
	}

	/**
	 * Cleanup resources
	 */
	private async cleanup(): Promise<void> {
		try {
			// Stop maintenance and close all database connections
			stop_connection_maintenance();
			close_all_databases();

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

			// Start explicit connection maintenance. Tools are registered when
			// the server is created so discovery works before a legacy session.
			start_connection_maintenance();

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

			// Setup transport
			const transport = new StdioTransport(this.server);
			transport.listen();

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
