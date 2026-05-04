import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
	close_all_databases,
	open_database,
	stop_connection_maintenance,
} from './connection-manager.js';
import {
	execute_query,
	execute_select_query,
} from './query-executor.js';
import { export_schema, import_schema } from './schema-manager.js';

const temp_dirs: string[] = [];

function temp_db(name = 'test.sqlite') {
	const dir = mkdtempSync(join(tmpdir(), 'mcp-sqlite-tools-'));
	temp_dirs.push(dir);
	const db_path = join(dir, name);
	open_database(db_path, true);
	return db_path;
}

afterAll(() => {
	close_all_databases();
	stop_connection_maintenance();
	for (const dir of temp_dirs)
		rmSync(dir, { recursive: true, force: true });
});

describe('schema manager', () => {
	it('parameterizes schema export table filters', () => {
		const db_path = temp_db();
		execute_query(db_path, 'CREATE TABLE public (id INTEGER)');
		execute_query(db_path, 'CREATE TABLE secret (id INTEGER)');

		expect(
			export_schema(db_path, 'json', ['public']).tables_count,
		).toBe(1);
		expect(
			export_schema(db_path, 'json', ["public') OR 1=1 --"])
				.tables_count,
		).toBe(0);
	});

	it('imports trigger schemas containing internal semicolons', () => {
		const db_path = temp_db();
		const schema = `
			CREATE TABLE source (value TEXT);
			CREATE TABLE audit (message TEXT);
			CREATE TRIGGER audit_source_insert
			AFTER INSERT ON source
			BEGIN
				INSERT INTO audit (message) VALUES ('created; still one trigger');
			END;
		`;

		expect(import_schema(db_path, schema).statements_executed).toBe(
			3,
		);

		execute_query(db_path, "INSERT INTO source (value) VALUES ('x')");
		expect(
			execute_select_query(db_path, 'SELECT message FROM audit').rows,
		).toEqual([{ message: 'created; still one trigger' }]);
	});
});
