function strip_leading_sql_comments(statement: string): string {
	let remaining = statement.trim();
	let changed = true;

	while (changed) {
		changed = false;
		if (remaining.startsWith('--')) {
			const newline_index = remaining.indexOf('\n');
			remaining =
				newline_index === -1
					? ''
					: remaining.slice(newline_index + 1).trim();
			changed = true;
		}
		if (remaining.startsWith('/*')) {
			const end_index = remaining.indexOf('*/');
			if (end_index === -1) return '';
			remaining = remaining.slice(end_index + 2).trim();
			changed = true;
		}
	}

	return remaining;
}

/**
 * Split SQLite schema SQL into executable statements while respecting quoted
 * strings, comments, and CREATE TRIGGER bodies that contain internal semicolons.
 */
export function split_schema_statements(schema: string): string[] {
	const statements: string[] = [];
	let current = '';
	let in_single_quote = false;
	let in_double_quote = false;
	let in_bracket_quote = false;
	let in_line_comment = false;
	let in_block_comment = false;
	let trigger_depth = 0;
	let word = '';

	function flush_word() {
		if (!word) return;
		const normalized_word = word.toLowerCase();
		if (normalized_word === 'trigger')
			trigger_depth = Math.max(trigger_depth, 1);
		if (normalized_word === 'begin' && trigger_depth > 0)
			trigger_depth++;
		if (normalized_word === 'end' && trigger_depth > 0)
			trigger_depth--;
		word = '';
	}

	for (let i = 0; i < schema.length; i++) {
		const char = schema[i];
		const next_char = schema[i + 1];
		current += char;

		if (in_line_comment) {
			if (char === '\n') in_line_comment = false;
			continue;
		}

		if (in_block_comment) {
			if (char === '*' && next_char === '/') {
				current += next_char;
				i++;
				in_block_comment = false;
			}
			continue;
		}

		if (in_single_quote) {
			if (char === "'" && next_char === "'") {
				current += next_char;
				i++;
				continue;
			}
			if (char === "'") in_single_quote = false;
			continue;
		}

		if (in_double_quote) {
			if (char === '"' && next_char === '"') {
				current += next_char;
				i++;
				continue;
			}
			if (char === '"') in_double_quote = false;
			continue;
		}

		if (in_bracket_quote) {
			if (char === ']') in_bracket_quote = false;
			continue;
		}

		if (char === '-' && next_char === '-') {
			flush_word();
			current += next_char;
			i++;
			in_line_comment = true;
			continue;
		}

		if (char === '/' && next_char === '*') {
			flush_word();
			current += next_char;
			i++;
			in_block_comment = true;
			continue;
		}

		if (char === "'") {
			flush_word();
			in_single_quote = true;
			continue;
		}

		if (char === '"') {
			flush_word();
			in_double_quote = true;
			continue;
		}

		if (char === '[') {
			flush_word();
			in_bracket_quote = true;
			continue;
		}

		if (/[_A-Za-z0-9]/.test(char)) {
			word += char;
		} else {
			flush_word();
		}

		if (char === ';' && trigger_depth === 0) {
			const statement = strip_leading_sql_comments(
				current.slice(0, -1),
			);
			if (statement) statements.push(statement);
			current = '';
		}
	}

	flush_word();
	const final_statement = strip_leading_sql_comments(current);
	if (final_statement) statements.push(final_statement);

	return statements;
}
