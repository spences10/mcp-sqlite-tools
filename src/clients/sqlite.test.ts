import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
import { backup_database } from './sqlite.js';

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

describe('SQLite facade', () => {
	it('creates consistent backups that include committed WAL data', async () => {
		const db_path = temp_db();
		execute_query(db_path, 'CREATE TABLE t (value TEXT)');
		execute_query(
			db_path,
			"INSERT INTO t (value) VALUES ('from-wal')",
		);

		const backup_path = join(dirname(db_path), 'backup.sqlite');
		const backup_info = await backup_database(db_path, backup_path);

		expect(backup_info.destination).toBe(backup_path);
		expect(
			execute_select_query(
				backup_path,
				'SELECT value FROM t ORDER BY value',
			).rows,
		).toEqual([{ value: 'from-wal' }]);
	});
});
