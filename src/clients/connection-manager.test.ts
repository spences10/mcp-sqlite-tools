import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
} from 'vite-plus/test';

import {
	close_all_databases,
	open_database,
	validate_database_path,
} from './connection-manager.js';
import { execute_select_query } from './query-executor.js';

const sandbox = mkdtempSync(
	join(tmpdir(), 'mcp-sqlite-tools-paths-'),
);
const default_path = join(sandbox, 'databases');
const outside_path = join(sandbox, 'outside');
const original_default_path = process.env.SQLITE_DEFAULT_PATH;
const original_allow_absolute =
	process.env.SQLITE_ALLOW_ABSOLUTE_PATHS;
const original_journal_mode = process.env.SQLITE_JOURNAL_MODE;

beforeAll(() => {
	mkdirSync(default_path);
	mkdirSync(outside_path);
	process.env.SQLITE_DEFAULT_PATH = default_path;
	process.env.SQLITE_ALLOW_ABSOLUTE_PATHS = 'false';
	process.env.SQLITE_JOURNAL_MODE = 'delete';
});

afterAll(() => {
	close_all_databases();
	rmSync(sandbox, { recursive: true, force: true });

	if (original_default_path === undefined)
		delete process.env.SQLITE_DEFAULT_PATH;
	else process.env.SQLITE_DEFAULT_PATH = original_default_path;

	if (original_allow_absolute === undefined)
		delete process.env.SQLITE_ALLOW_ABSOLUTE_PATHS;
	else
		process.env.SQLITE_ALLOW_ABSOLUTE_PATHS = original_allow_absolute;

	if (original_journal_mode === undefined)
		delete process.env.SQLITE_JOURNAL_MODE;
	else process.env.SQLITE_JOURNAL_MODE = original_journal_mode;
});

describe('database path confinement', () => {
	it('supports repeated validation and database use', () => {
		const db = open_database('nested/test.db', true);
		const resolved_path = validate_database_path('nested/test.db');

		expect(validate_database_path(resolved_path)).toBe(resolved_path);
		expect(
			execute_select_query(resolved_path, 'SELECT 1 AS value').rows,
		).toEqual([{ value: 1 }]);
		expect(db.pragma('journal_mode', { simple: true })).toBe(
			'delete',
		);
	});

	it('rejects relative and absolute paths outside the default path', () => {
		expect(() =>
			validate_database_path('../outside/test.db'),
		).toThrow(/outside the default directory/);
		expect(() =>
			validate_database_path(join(outside_path, 'test.db')),
		).toThrow(/outside the default directory/);
	});

	it('allows names that start with two dots inside the default path', () => {
		expect(validate_database_path('..data/test.db')).toBe(
			join(default_path, '..data', 'test.db'),
		);
	});

	it('rejects paths that escape through a symbolic link', () => {
		const link_path = join(default_path, 'escape');
		symlinkSync(
			outside_path,
			link_path,
			process.platform === 'win32' ? 'junction' : 'dir',
		);

		expect(() => validate_database_path('escape/test.db')).toThrow(
			/outside the default directory/,
		);
	});
});
