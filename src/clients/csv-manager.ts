/**
 * CSV import/export functionality for SQLite Tools MCP server
 */
import csv_parser from 'csv-parser';
import { createArrayCsvWriter } from 'csv-writer';
import {
	createReadStream,
	existsSync,
	mkdirSync,
	statSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { with_error_handling } from '../common/errors.js';
import { quote_identifier } from '../common/sql.js';
import { debug_log } from '../config.js';
import { open_database } from './connection-manager.js';
import { has_active_transaction } from './transaction-manager.js';

export interface CsvImportOptions {
	delimiter?: string;
	quote?: string;
	escape?: string;
	encoding?: BufferEncoding;
	create_table?: boolean;
	batch_size?: number;
	fail_fast?: boolean;
	max_errors?: number;
	coerce_types?: boolean;
}

export interface CsvExportOptions {
	delimiter?: string;
	record_delimiter?: string;
	encoding?: BufferEncoding;
	always_quote?: boolean;
	append?: boolean;
}

export interface CsvRowError {
	row: number;
	error: string;
	data: Record<string, unknown>;
}

export interface CsvImportResult {
	file_path: string;
	table: string;
	created_table: boolean;
	columns: string[];
	rows_read: number;
	inserted: number;
	failed: number;
	errors: CsvRowError[];
	errors_truncated: boolean;
	total_time: number;
}

export interface CsvExportResult {
	file_path: string;
	query: string;
	columns: string[];
	rows_exported: number;
	bytes_written: number;
	total_time: number;
}

interface ParsedCsv {
	headers: string[];
	rows: Record<string, string>[];
}

function resolve_csv_path(file_path: string): string {
	return isAbsolute(file_path)
		? file_path
		: resolve(process.cwd(), file_path);
}

function validate_csv_options(options: {
	delimiter?: string;
	quote?: string;
	escape?: string;
}): void {
	for (const name of ['delimiter', 'quote', 'escape'] as const) {
		const value = options[name];
		if (value !== undefined && value.length !== 1) {
			throw new Error(`CSV ${name} must be a single character`);
		}
	}
}

function validate_headers(headers: string[]): void {
	if (headers.length === 0) {
		throw new Error('CSV file must contain a header row');
	}

	const seen = new Set<string>();
	for (const header of headers) {
		quote_identifier(header);
		if (seen.has(header)) {
			throw new Error(`Duplicate CSV header: ${header}`);
		}
		seen.add(header);
	}
}

function coerce_csv_value(
	value: string | null | undefined,
): string | number | null {
	if (value === null || value === undefined) return null;

	const text = value;
	const trimmed = text.trim();

	if (trimmed === '' || /^null$/i.test(trimmed)) return null;
	if (/^true$/i.test(trimmed)) return 1;
	if (/^false$/i.test(trimmed)) return 0;

	if (/^[+-]?\d+$/.test(trimmed)) {
		const number_value = Number(trimmed);
		if (Number.isSafeInteger(number_value)) return number_value;
	}

	if (
		/^[+-]?(?:(?:\d+\.\d*)|(?:\d*\.\d+)|(?:\d+))(?:e[+-]?\d+)?$/i.test(
			trimmed,
		)
	) {
		const number_value = Number(trimmed);
		if (Number.isFinite(number_value)) return number_value;
	}

	return text;
}

function infer_sqlite_type(
	values: unknown[],
): 'INTEGER' | 'REAL' | 'TEXT' {
	const non_null_values = values.filter((value) => value !== null);
	if (non_null_values.length === 0) return 'TEXT';

	if (
		non_null_values.every(
			(value) => typeof value === 'number' && Number.isInteger(value),
		)
	) {
		return 'INTEGER';
	}

	if (non_null_values.every((value) => typeof value === 'number')) {
		return 'REAL';
	}

	return 'TEXT';
}

function get_table_columns(
	database_path: string,
	table: string,
): string[] {
	const db = open_database(database_path);
	const table_info = db
		.prepare(`PRAGMA table_info(${quote_identifier(table)})`)
		.all() as Array<{ name: string }>;

	return table_info.map((column) => column.name);
}

function table_exists(database_path: string, table: string): boolean {
	const db = open_database(database_path);
	const row = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
		)
		.get(table);

	return row !== undefined;
}

function create_table_from_csv(
	database_path: string,
	table: string,
	headers: string[],
	rows: Array<Record<string, unknown>>,
): void {
	const db = open_database(database_path);
	const column_definitions = headers
		.map((header) => {
			const values = rows.map((row) => row[header]);
			return `${quote_identifier(header)} ${infer_sqlite_type(values)}`;
		})
		.join(', ');

	db.exec(
		`CREATE TABLE ${quote_identifier(table)} (${column_definitions})`,
	);
}

async function parse_csv_file(
	file_path: string,
	options: CsvImportOptions,
): Promise<ParsedCsv> {
	validate_csv_options(options);

	return new Promise((resolve_promise, reject_promise) => {
		const rows: Record<string, string>[] = [];
		let headers: string[] = [];

		createReadStream(file_path, {
			encoding: options.encoding ?? 'utf8',
		})
			.pipe(
				csv_parser({
					separator: options.delimiter ?? ',',
					quote: options.quote ?? '"',
					escape: options.escape ?? '"',
					strict: true,
					mapHeaders: ({ header }) => header.trim(),
				}),
			)
			.on('headers', (parsed_headers: string[]) => {
				headers = parsed_headers;
			})
			.on('data', (row: Record<string, string>) => {
				rows.push(row);
			})
			.on('error', reject_promise)
			.on('end', () => {
				try {
					validate_headers(headers);
					resolve_promise({ headers, rows });
				} catch (error) {
					reject_promise(error);
				}
			});
	});
}

function prepare_rows(
	rows: Record<string, string>[],
	headers: string[],
	coerce_types: boolean,
): Array<Record<string, unknown>> {
	return rows.map((row) => {
		const prepared_row: Record<string, unknown> = {};
		for (const header of headers) {
			prepared_row[header] = coerce_types
				? coerce_csv_value(row[header])
				: row[header];
		}
		return prepared_row;
	});
}

function validate_import_columns(
	csv_headers: string[],
	table_columns: string[],
): void {
	const table_column_set = new Set(table_columns);
	const unknown_headers = csv_headers.filter(
		(header) => !table_column_set.has(header),
	);

	if (unknown_headers.length > 0) {
		throw new Error(
			`CSV headers not found in target table: ${unknown_headers.join(', ')}`,
		);
	}
}

function row_error_message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Import a CSV file into a SQLite table. CSV headers are required.
 */
export async function import_csv(
	database_path: string,
	table: string,
	file_path: string,
	options: CsvImportOptions = {},
): Promise<CsvImportResult> {
	return with_error_handling(async () => {
		const start_time = Date.now();
		const resolved_file_path = resolve_csv_path(file_path);
		const create_table = options.create_table ?? true;
		const batch_size = options.batch_size ?? 1000;
		const max_errors = options.max_errors ?? 100;
		const coerce_types = options.coerce_types ?? true;

		if (!existsSync(resolved_file_path)) {
			throw new Error(
				`CSV file does not exist: ${resolved_file_path}`,
			);
		}

		const parsed_csv = await parse_csv_file(
			resolved_file_path,
			options,
		);
		const prepared_rows = prepare_rows(
			parsed_csv.rows,
			parsed_csv.headers,
			coerce_types,
		);

		let created_table = false;
		if (table_exists(database_path, table)) {
			validate_import_columns(
				parsed_csv.headers,
				get_table_columns(database_path, table),
			);
		} else {
			if (!create_table) {
				throw new Error(`Target table does not exist: ${table}`);
			}
			create_table_from_csv(
				database_path,
				table,
				parsed_csv.headers,
				prepared_rows,
			);
			created_table = true;
		}

		const db = open_database(database_path);
		const placeholders = parsed_csv.headers.map(() => '?').join(', ');
		const column_list = parsed_csv.headers
			.map(quote_identifier)
			.join(', ');
		const insert_sql = `INSERT INTO ${quote_identifier(table)} (${column_list}) VALUES (${placeholders})`;
		const stmt = db.prepare(insert_sql);
		const errors: CsvRowError[] = [];
		let inserted = 0;
		let failed = 0;
		let errors_truncated = false;

		const use_transaction = !has_active_transaction(database_path);
		if (use_transaction) db.exec('BEGIN');

		try {
			for (let i = 0; i < prepared_rows.length; i += batch_size) {
				const batch = prepared_rows.slice(i, i + batch_size);

				for (
					let batch_index = 0;
					batch_index < batch.length;
					batch_index++
				) {
					const row_index = i + batch_index;
					const row = batch[batch_index];
					const values = parsed_csv.headers.map(
						(header) => row[header],
					);

					try {
						const result = stmt.run(values);
						if (result.changes > 0) inserted++;
					} catch (error) {
						failed++;
						if (errors.length < max_errors) {
							errors.push({
								row: row_index + 2,
								error: row_error_message(error),
								data: row,
							});
						} else {
							errors_truncated = true;
						}

						if (options.fail_fast) throw error;
					}
				}
			}

			if (use_transaction) db.exec('COMMIT');
		} catch (error) {
			if (use_transaction) db.exec('ROLLBACK');
			throw error;
		}

		const result = {
			file_path: resolved_file_path,
			table,
			created_table,
			columns: parsed_csv.headers,
			rows_read: prepared_rows.length,
			inserted,
			failed,
			errors,
			errors_truncated,
			total_time: Date.now() - start_time,
		};

		debug_log('CSV import completed:', result);
		return result;
	}, 'import_csv')();
}

/**
 * Export a SQLite table or read-only query to a CSV file.
 */
export async function export_csv(
	database_path: string,
	file_path: string,
	input: { table?: string; query?: string },
	options: CsvExportOptions = {},
): Promise<CsvExportResult> {
	return with_error_handling(async () => {
		const start_time = Date.now();
		const resolved_file_path = resolve_csv_path(file_path);

		validate_csv_options({ delimiter: options.delimiter });

		if (
			(input.table && input.query) ||
			(!input.table && !input.query)
		) {
			throw new Error(
				'Provide exactly one of table or query for CSV export',
			);
		}

		const query = input.table
			? `SELECT * FROM ${quote_identifier(input.table)}`
			: input.query!;
		const db = open_database(database_path);
		const stmt = db.prepare(query);

		if (!stmt.readonly) {
			throw new Error('CSV export query must be read-only');
		}

		const columns = stmt.columns().map((column) => column.name);
		const rows = stmt.raw(true).all() as unknown[][];
		const output_dir = dirname(resolved_file_path);
		if (!existsSync(output_dir)) {
			mkdirSync(output_dir, { recursive: true });
		}

		const csv_writer = createArrayCsvWriter({
			path: resolved_file_path,
			header: columns,
			fieldDelimiter: options.delimiter ?? ',',
			recordDelimiter: options.record_delimiter,
			alwaysQuote: options.always_quote ?? false,
			encoding: options.encoding ?? 'utf8',
			append: options.append ?? false,
		});

		await csv_writer.writeRecords(rows);
		const bytes_written = existsSync(resolved_file_path)
			? statSync(resolved_file_path).size
			: 0;
		const result = {
			file_path: resolved_file_path,
			query,
			columns,
			rows_exported: rows.length,
			bytes_written,
			total_time: Date.now() - start_time,
		};

		debug_log('CSV export completed:', result);
		return result;
	}, 'export_csv')();
}
