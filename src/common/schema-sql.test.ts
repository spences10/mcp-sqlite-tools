import { describe, expect, it } from 'vitest';

import { split_schema_statements } from './schema-sql.js';

describe('schema SQL splitter', () => {
	it('keeps trigger bodies with internal semicolons as one statement', () => {
		const schema = `
			CREATE TABLE source (value TEXT);
			CREATE TABLE audit (message TEXT);
			CREATE TRIGGER audit_source_insert
			AFTER INSERT ON source
			BEGIN
				INSERT INTO audit (message) VALUES ('created; still one trigger');
			END;
		`;

		expect(split_schema_statements(schema)).toHaveLength(3);
	});
});
