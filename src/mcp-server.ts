import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { McpServer } from 'tmcp';
import { register_tools } from './tools/handler.js';

export interface ServerMetadata {
	name: string;
	version: string;
	description: string;
}

/** Create a fully registered MCP server for a transport. */
export function create_mcp_server(
	metadata: ServerMetadata,
): McpServer<any> {
	const server = new McpServer<any>(metadata, {
		adapter: new ValibotJsonSchemaAdapter(),
		capabilities: {
			tools: { listChanged: true },
		},
	});
	register_tools(server);
	return server;
}
