import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { stop_connection_maintenance } from './clients/connection-manager.js';
import {
	bulk_insert,
	close_all_databases,
	execute_query,
	execute_select_query,
	export_schema,
	is_read_only_query,
	open_database,
} from './clients/sqlite.js';
import {
	format_default_value,
	quote_identifier,
	should_paginate_read_query,
} from './common/sql.js';

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

describe('SQLite safety boundaries', () => {
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

	it('only paginates SELECT-style reads', () => {
		expect(should_paginate_read_query('SELECT * FROM t')).toBe(true);
		expect(
			should_paginate_read_query(
				'WITH c AS (SELECT 1) SELECT * FROM c',
			),
		).toBe(true);
		expect(should_paginate_read_query('PRAGMA table_info(t)')).toBe(
			false,
		);
		expect(should_paginate_read_query('EXPLAIN SELECT 1')).toBe(
			false,
		);
		expect(
			should_paginate_read_query('SELECT * FROM t LIMIT 5'),
		).toBe(false);
	});

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

	it('quotes identifiers and default literals', () => {
		expect(quote_identifier('a"b')).toBe('"a""b"');
		expect(format_default_value("x'); DROP TABLE users; --")).toBe(
			"'x''); DROP TABLE users; --'",
		);
		expect(format_default_value('CURRENT_TIMESTAMP')).toBe(
			'CURRENT_TIMESTAMP',
		);
		expect(format_default_value(true)).toBe('1');
	});
});
