/**
 * Unified tool handler for the SQLite Tools MCP server
 */
import { McpServer } from 'tmcp';
import { register_admin_tools } from './admin-tools.js';
import { register_query_tools } from './query-tools.js';
import { register_schema_tools } from './schema-tools.js';
import { register_transaction_tools } from './transaction-tools.js';

/**
 * Register all tools with the server
 */
export function register_tools(server: McpServer<any>): void {
	register_admin_tools(server);
	register_query_tools(server);
	register_transaction_tools(server);
	register_schema_tools(server);
}
