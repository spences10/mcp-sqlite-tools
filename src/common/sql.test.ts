import { describe, expect, it } from 'vitest';

import {
	format_default_value,
	quote_identifier,
	should_paginate_read_query,
} from './sql.js';

describe('SQL helpers', () => {
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
