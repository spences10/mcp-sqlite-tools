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
	bulk_insert,
	execute_query,
	execute_select_query,
	is_read_only_query,
} from './query-executor.js';

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

describe('query executor', () => {
	it('rejects mutating PRAGMA statements on the read path', () => {
		const db_path = temp_db();
		execute_query(db_path, 'CREATE TABLE t (id INTEGER)');

		expect(is_read_only_query('SELECT 1', db_path)).toBe(true);
		expect(
			is_read_only_query('PRAGMA journal_mode=DELETE', db_path),
		).toBe(false);
		expect(() =>
			execute_select_query(db_path, 'PRAGMA journal_mode=DELETE'),
		).toThrow(/Query is not read-only/);
		expect(() =>
			execute_select_query(db_path, 'SELECT 1; DROP TABLE t'),
		).toThrow(/contains more than one statement/);
	});

	it('quotes generated identifier SQL for bulk inserts', () => {
		const db_path = temp_db();
		execute_query(db_path, 'CREATE TABLE "odd; table" ("a""b" TEXT)');

		const result = bulk_insert(db_path, 'odd; table', [
			{ 'a"b': 'ok' },
		]);
		expect(result.inserted).toBe(1);

		const rows = execute_select_query(
			db_path,
			'SELECT "a""b" AS value FROM "odd; table"',
		).rows;
		expect(rows).toEqual([{ value: 'ok' }]);
	});
});
