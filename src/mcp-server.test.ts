import { describe, expect, it } from 'vitest';
import { create_mcp_server } from './mcp-server.js';

const modern_meta = {
	'io.modelcontextprotocol/protocolVersion': '2026-07-28',
	'io.modelcontextprotocol/clientCapabilities': {},
	'io.modelcontextprotocol/clientInfo': {
		name: 'protocol-test',
		version: '1.0.0',
	},
};

function request(
	server: ReturnType<typeof create_mcp_server>,
	id: number,
	method: string,
	params: Record<string, unknown> = {},
) {
	return server.receive({
		jsonrpc: '2.0',
		id,
		method,
		params: {
			...params,
			_meta: modern_meta,
		},
	});
}

describe('MCP 2026-07-28 protocol', () => {
	it('supports stateless discovery and tool listing', async () => {
		const server = create_mcp_server({
			name: 'mcp-sqlite-tools',
			version: 'test',
			description: 'test server',
		});

		const discovery = await request(server, 1, 'server/discover');
		expect(discovery).toMatchObject({
			jsonrpc: '2.0',
			id: 1,
			result: {
				supportedVersions: ['2026-07-28'],
				capabilities: { tools: {} },
				resultType: 'complete',
				_meta: {
					'io.modelcontextprotocol/serverInfo': {
						name: 'mcp-sqlite-tools',
					},
				},
			},
		});

		const listed = await request(server, 2, 'tools/list');
		expect(listed).toMatchObject({
			jsonrpc: '2.0',
			id: 2,
			result: { tools: expect.any(Array) },
		});
		expect(
			(
				listed as { result: { tools: Array<{ name: string }> } }
			).result.tools.map((tool) => tool.name),
		).toContain('execute_read_query');
	});

	it('uses modern errors and validates stateless tool calls', async () => {
		const server = create_mcp_server({
			name: 'mcp-sqlite-tools',
			version: 'test',
			description: 'test server',
		});

		const missing_tool = await request(server, 3, 'tools/call', {
			name: 'not_a_tool',
			arguments: {},
		});
		expect(missing_tool).toMatchObject({
			jsonrpc: '2.0',
			id: 3,
			result: {
				isError: true,
				resultType: 'complete',
				content: [
					expect.objectContaining({
						type: 'text',
						text: 'Tool not_a_tool not found',
					}),
				],
			},
		});

		const unsupported_version = await server.receive({
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/list',
			params: {
				_meta: {
					...modern_meta,
					'io.modelcontextprotocol/protocolVersion': '2099-01-01',
				},
			},
		});
		expect(unsupported_version).toMatchObject({
			jsonrpc: '2.0',
			id: 4,
			error: { code: -32022 },
		});
	});
});
