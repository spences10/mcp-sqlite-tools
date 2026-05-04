import { ValidationError } from './errors.js';

const SQLITE_CONSTANT_DEFAULTS = new Set([
	'CURRENT_TIME',
	'CURRENT_DATE',
	'CURRENT_TIMESTAMP',
]);

/**
 * Quote a single SQLite identifier safely.
 *
 * SQLite does not support binding identifiers as parameters, so generated SQL
 * must quote names instead of interpolating raw user input.
 */
export function quote_identifier(identifier: string): string {
	if (!identifier || identifier.length > 64) {
		throw new ValidationError(
			'Identifier must be between 1 and 64 characters',
			'identifier',
			identifier,
		);
	}

	if (identifier.includes('\0')) {
		throw new ValidationError(
			'Identifier cannot contain null bytes',
			'identifier',
			identifier,
		);
	}

	return `"${identifier.replace(/"/g, '""')}"`;
}

/** Render a SQLite DEFAULT value without allowing raw SQL injection. */
export function format_default_value(value: unknown): string {
	if (value === null) return 'NULL';

	if (typeof value === 'boolean') return value ? '1' : '0';

	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new ValidationError(
				'Default number must be finite',
				'default_value',
				value,
			);
		}
		return String(value);
	}

	if (typeof value === 'string') {
		const upper = value.toUpperCase();
		if (SQLITE_CONSTANT_DEFAULTS.has(upper)) return upper;
		return `'${value.replace(/'/g, "''")}'`;
	}

	throw new ValidationError(
		'Unsupported default value type',
		'default_value',
		value,
	);
}

export function should_paginate_read_query(query: string): boolean {
	const normalized = query.trimStart().toLowerCase();
	return (
		/^(select|with)\b/.test(normalized) && !/\blimit\b/i.test(query)
	);
}

export function trim_trailing_semicolon(query: string): string {
	return query.trim().replace(/;\s*$/, '');
}

export function looks_like_read_query(query: string): boolean {
	const normalized = query.trimStart().toLowerCase();
	return /^(select|with|pragma|explain)\b/.test(normalized);
}
