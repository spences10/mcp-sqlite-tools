import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
	close_all_databases,
	open_database,
	stop_connection_maintenance,
} from '../clients/connection-manager.js';
import { register_tools } from './handler.js';

type ToolHandler = (
	input: Record<string, unknown>,
) => Promise<unknown>;

const temp_dirs: string[] = [];

function temp_db(name = 'test.sqlite') {
	const dir = mkdtempSync(join(tmpdir(), 'mcp-sqlite-tools-'));
	temp_dirs.push(dir);
	const db_path = join(dir, name);
	open_database(db_path, true);
	return db_path;
}

function tool_handlers() {
	const handlers = new Map<string, ToolHandler>();
	const server = {
		tool(definition: { name: string }, handler: ToolHandler) {
			handlers.set(definition.name, handler);
		},
	};
	register_tools(server as never);
	return handlers;
}

async function call_tool(
	handlers: Map<string, ToolHandler>,
	name: string,
	input: Record<string, unknown>,
) {
	const handler = handlers.get(name);
	if (!handler) throw new Error(`Tool not registered: ${name}`);
	const response = (await handler(input)) as {
		content: Array<{ text: string }>;
		isError?: boolean;
	};
	return {
		...response,
		json: JSON.parse(response.content[0]?.text ?? '{}') as Record<
			string,
			unknown
		>,
	};
}

afterAll(() => {
	close_all_databases();
	stop_connection_maintenance();
	for (const dir of temp_dirs)
		rmSync(dir, { recursive: true, force: true });
});

describe('tool handler registration', () => {
	it('exercises registered MCP tool handlers at the boundary', async () => {
		const handlers = tool_handlers();
		const db_path = temp_db();

		await call_tool(handlers, 'open_database', { path: db_path });
		await call_tool(handlers, 'execute_schema_query', {
			query: 'CREATE TABLE tool_test (value TEXT)',
		});
		await call_tool(handlers, 'execute_write_query', {
			query: "INSERT INTO tool_test (value) VALUES ('ok')",
		});

		const read_response = await call_tool(
			handlers,
			'execute_read_query',
			{ query: 'SELECT value FROM tool_test' },
		);
		expect(read_response.isError).toBeUndefined();
		expect(read_response.json).toMatchObject({ row_count: 1 });

		const error_response = await call_tool(
			handlers,
			'execute_read_query',
			{ query: 'PRAGMA journal_mode=DELETE' },
		);
		expect(error_response.isError).toBe(true);
		expect(error_response.json).toMatchObject({
			error_type: 'tool_usage_error',
		});
		expect(error_response.json.message).toContain(
			'Only SQLite readonly statements',
		);
		expect(error_response.json.suggestions).toContain(
			'Use execute_write_query for INSERT, UPDATE, DELETE, or mutating PRAGMA statements',
		);
	});
});
