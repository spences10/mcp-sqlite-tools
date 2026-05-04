import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import {
	bulk_insert,
	close_all_databases,
	execute_query,
	execute_select_query,
	export_schema,
	open_database,
	is_read_only_query,
} from '../dist/clients/sqlite.js';
import { stop_connection_maintenance } from '../dist/clients/connection-manager.js';
import {
	format_default_value,
	quote_identifier,
	should_paginate_read_query,
} from '../dist/common/sql.js';

const tempDirs = [];

function tempDb(name = 'test.sqlite') {
	const dir = mkdtempSync(join(tmpdir(), 'mcp-sqlite-tools-'));
	tempDirs.push(dir);
	const dbPath = join(dir, name);
	open_database(dbPath, true);
	return dbPath;
}

after(() => {
	close_all_databases();
	stop_connection_maintenance();
	for (const dir of tempDirs)
		rmSync(dir, { recursive: true, force: true });
});

test('read query path rejects mutating PRAGMA statements', () => {
	const dbPath = tempDb();
	execute_query(dbPath, 'CREATE TABLE t (id INTEGER)');

	assert.equal(is_read_only_query('SELECT 1', dbPath), true);
	assert.equal(
		is_read_only_query('PRAGMA journal_mode=DELETE', dbPath),
		false,
	);
	assert.throws(
		() => execute_select_query(dbPath, 'PRAGMA journal_mode=DELETE'),
		/Query is not read-only/,
	);
	assert.throws(
		() => execute_select_query(dbPath, 'SELECT 1; DROP TABLE t'),
		/contains more than one statement/,
	);
});

test('pagination helper only targets SELECT-style reads', () => {
	assert.equal(should_paginate_read_query('SELECT * FROM t'), true);
	assert.equal(
		should_paginate_read_query(
			'WITH c AS (SELECT 1) SELECT * FROM c',
		),
		true,
	);
	assert.equal(
		should_paginate_read_query('PRAGMA table_info(t)'),
		false,
	);
	assert.equal(should_paginate_read_query('EXPLAIN SELECT 1'), false);
	assert.equal(
		should_paginate_read_query('SELECT * FROM t LIMIT 5'),
		false,
	);
});

test('schema export table filter is parameterized', () => {
	const dbPath = tempDb();
	execute_query(dbPath, 'CREATE TABLE public (id INTEGER)');
	execute_query(dbPath, 'CREATE TABLE secret (id INTEGER)');

	assert.equal(
		export_schema(dbPath, 'json', ['public']).tables_count,
		1,
	);
	assert.equal(
		export_schema(dbPath, 'json', ["public') OR 1=1 --"])
			.tables_count,
		0,
	);
});

test('generated identifier SQL is quoted for bulk inserts', () => {
	const dbPath = tempDb();
	execute_query(dbPath, 'CREATE TABLE "odd; table" ("a""b" TEXT)');

	const result = bulk_insert(dbPath, 'odd; table', [{ 'a"b': 'ok' }]);
	assert.equal(result.inserted, 1);

	const rows = execute_select_query(
		dbPath,
		'SELECT "a""b" AS value FROM "odd; table"',
	).rows;
	assert.deepEqual(rows, [{ value: 'ok' }]);
});

test('SQL helper quotes identifiers and default literals', () => {
	assert.equal(quote_identifier('a"b'), '"a""b"');
	assert.equal(
		format_default_value("x'); DROP TABLE users; --"),
		"'x''); DROP TABLE users; --'",
	);
	assert.equal(
		format_default_value('CURRENT_TIMESTAMP'),
		'CURRENT_TIMESTAMP',
	);
	assert.equal(format_default_value(true), '1');
});
