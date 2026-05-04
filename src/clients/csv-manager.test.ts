import {
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
	close_all_databases,
	open_database,
	stop_connection_maintenance,
} from './connection-manager.js';
import { export_csv, import_csv } from './csv-manager.js';
import {
	execute_query,
	execute_select_query,
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

describe('CSV manager', () => {
	it('imports CSV files with table creation and type coercion', async () => {
		const db_path = temp_db();
		const csv_path = join(dirname(db_path), 'people.csv');
		writeFileSync(
			csv_path,
			'name,age,active,note\nAda,42,true,\nBob,3.5,false,hello\n',
		);

		const result = await import_csv(db_path, 'people', csv_path);
		expect(result).toMatchObject({
			created_table: true,
			rows_read: 2,
			inserted: 2,
			failed: 0,
		});

		expect(
			execute_select_query(
				db_path,
				'SELECT name, age, active, note FROM people ORDER BY name',
			).rows,
		).toEqual([
			{ name: 'Ada', age: 42, active: 1, note: null },
			{ name: 'Bob', age: 3.5, active: 0, note: 'hello' },
		]);
	});

	it('reports CSV row import errors and continues', async () => {
		const db_path = temp_db();
		execute_query(
			db_path,
			'CREATE TABLE constrained (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
		);
		const csv_path = join(dirname(db_path), 'constrained.csv');
		writeFileSync(csv_path, 'id,name\n1,Ada\n1,Bob\n2,\n');

		const result = await import_csv(db_path, 'constrained', csv_path);
		expect(result.inserted).toBe(1);
		expect(result.failed).toBe(2);
		expect(result.errors).toHaveLength(2);
		expect(result.errors.map((error) => error.row)).toEqual([3, 4]);
		expect(
			execute_select_query(
				db_path,
				'SELECT id, name FROM constrained ORDER BY id',
			).rows,
		).toEqual([{ id: 1, name: 'Ada' }]);
	});

	it('exports tables and read-only queries to CSV files', async () => {
		const db_path = temp_db();
		execute_query(
			db_path,
			'CREATE TABLE exportable (id INTEGER, name TEXT)',
		);
		execute_query(
			db_path,
			"INSERT INTO exportable (id, name) VALUES (1, 'Ada'), (2, 'Bob')",
		);
		const table_csv_path = join(dirname(db_path), 'table-export.csv');
		const query_csv_path = join(dirname(db_path), 'query-export.csv');

		const table_result = await export_csv(db_path, table_csv_path, {
			table: 'exportable',
		});
		const query_result = await export_csv(db_path, query_csv_path, {
			query: 'SELECT name FROM exportable WHERE id = 2',
		});

		expect(table_result.rows_exported).toBe(2);
		expect(readFileSync(table_csv_path, 'utf8')).toBe(
			'id,name\n1,Ada\n2,Bob\n',
		);
		expect(query_result.rows_exported).toBe(1);
		expect(readFileSync(query_csv_path, 'utf8')).toBe('name\nBob\n');
	});
});
