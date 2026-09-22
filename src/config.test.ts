import { describe, expect, it } from 'vite-plus/test';

import { load_config } from './config.js';

describe('configuration', () => {
	it('normalizes and validates journal modes', () => {
		const original_journal_mode = process.env.SQLITE_JOURNAL_MODE;
		try {
			delete process.env.SQLITE_JOURNAL_MODE;
			expect(load_config().SQLITE_JOURNAL_MODE).toBe('wal');

			process.env.SQLITE_JOURNAL_MODE = ' TRUNCATE ';
			expect(load_config().SQLITE_JOURNAL_MODE).toBe('truncate');

			process.env.SQLITE_JOURNAL_MODE = 'memory';
			expect(() => load_config()).toThrow(
				/Configuration validation failed/,
			);
		} finally {
			if (original_journal_mode === undefined)
				delete process.env.SQLITE_JOURNAL_MODE;
			else process.env.SQLITE_JOURNAL_MODE = original_journal_mode;
		}
	});

	it('treats query timeout config as SQLite busy timeout', () => {
		const original_busy_timeout = process.env.SQLITE_BUSY_TIMEOUT;
		const original_max_query_time = process.env.SQLITE_MAX_QUERY_TIME;
		try {
			process.env.SQLITE_BUSY_TIMEOUT = '4000';
			process.env.SQLITE_MAX_QUERY_TIME = '9000';
			expect(load_config().SQLITE_BUSY_TIMEOUT).toBe(4000);
			expect(load_config().SQLITE_MAX_QUERY_TIME).toBe(4000);

			delete process.env.SQLITE_BUSY_TIMEOUT;
			process.env.SQLITE_MAX_QUERY_TIME = '9000';
			expect(load_config().SQLITE_BUSY_TIMEOUT).toBe(9000);
			expect(load_config().SQLITE_MAX_QUERY_TIME).toBe(9000);
		} finally {
			if (original_busy_timeout === undefined)
				delete process.env.SQLITE_BUSY_TIMEOUT;
			else process.env.SQLITE_BUSY_TIMEOUT = original_busy_timeout;

			if (original_max_query_time === undefined)
				delete process.env.SQLITE_MAX_QUERY_TIME;
			else
				process.env.SQLITE_MAX_QUERY_TIME = original_max_query_time;
		}
	});
});
