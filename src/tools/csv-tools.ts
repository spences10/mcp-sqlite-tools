/**
 * CSV import/export tools for the SQLite Tools MCP server
 */
import { McpServer } from 'tmcp';
import * as v from 'valibot';
import * as sqlite from '../clients/sqlite.js';
import {
	ToolUsageError,
	create_tool_error_response,
	create_tool_response,
} from '../common/errors.js';
import { debug_log } from '../config.js';
import {
	resolve_database_name,
	set_current_database,
} from './context.js';

const BufferEncodingSchema = v.union([
	v.literal('ascii'),
	v.literal('utf8'),
	v.literal('utf-8'),
	v.literal('utf16le'),
	v.literal('ucs2'),
	v.literal('ucs-2'),
	v.literal('base64'),
	v.literal('base64url'),
	v.literal('latin1'),
	v.literal('binary'),
	v.literal('hex'),
]);

const ImportCsvSchema = v.object({
	table: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	file_path: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
	create_table: v.optional(v.boolean(), true),
	batch_size: v.optional(
		v.pipe(v.number(), v.minValue(1), v.maxValue(10000)),
		1000,
	),
	fail_fast: v.optional(v.boolean(), false),
	max_errors: v.optional(
		v.pipe(v.number(), v.minValue(0), v.maxValue(10000)),
		100,
	),
	coerce_types: v.optional(v.boolean(), true),
	delimiter: v.optional(
		v.pipe(v.string(), v.minLength(1), v.maxLength(1)),
	),
	quote: v.optional(
		v.pipe(v.string(), v.minLength(1), v.maxLength(1)),
	),
	escape: v.optional(
		v.pipe(v.string(), v.minLength(1), v.maxLength(1)),
	),
	encoding: v.optional(BufferEncodingSchema, 'utf8'),
});

const ExportCsvSchema = v.object({
	file_path: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
	table: v.optional(
		v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	),
	query: v.optional(
		v.pipe(v.string(), v.minLength(1), v.maxLength(10000)),
	),
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
	delimiter: v.optional(
		v.pipe(v.string(), v.minLength(1), v.maxLength(1)),
	),
	record_delimiter: v.optional(
		v.union([v.literal('\n'), v.literal('\r\n')]),
	),
	encoding: v.optional(BufferEncodingSchema, 'utf8'),
	always_quote: v.optional(v.boolean(), false),
	append: v.optional(v.boolean(), false),
});

function setup_database_context(database_name?: string) {
	const database_path = resolve_database_name(database_name);
	if (database_name) set_current_database(database_name);
	return database_path;
}

/**
 * Register CSV tools with the server
 */
export function register_csv_tools(server: McpServer<any>): void {
	server.tool<typeof ImportCsvSchema>(
		{
			name: 'import_csv',
			description:
				'⚠️ DESTRUCTIVE/SCHEMA CHANGE: Import a headered CSV file into SQLite. Creates the table from headers when missing, coerces values by default, and reports row-level errors.',
			schema: ImportCsvSchema,
		},
		async ({
			table,
			file_path,
			database_name,
			create_table = true,
			batch_size = 1000,
			fail_fast = false,
			max_errors = 100,
			coerce_types = true,
			delimiter,
			quote,
			escape,
			encoding = 'utf8',
		}) => {
			try {
				debug_log('Executing tool: import_csv', {
					table,
					file_path,
					database_name,
					create_table,
					batch_size,
					fail_fast,
					max_errors,
					coerce_types,
					delimiter,
					quote,
					escape,
					encoding,
				});

				const database_path = setup_database_context(database_name);
				const result = await sqlite.import_csv(
					database_path,
					table,
					file_path,
					{
						create_table,
						batch_size,
						fail_fast,
						max_errors,
						coerce_types,
						delimiter,
						quote,
						escape,
						encoding,
					},
				);

				return create_tool_response({
					success: result.failed === 0,
					database: database_path,
					...result,
					message: `⚠️ CSV IMPORT COMPLETED: ${result.inserted} rows inserted into '${table}' from '${result.file_path}'. Failed rows: ${result.failed}`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof ExportCsvSchema>(
		{
			name: 'export_csv',
			description:
				'⚠️ FILE WRITE: Export a table or read-only SELECT/PRAGMA/EXPLAIN query to a CSV file. Can write absolute paths. Provide exactly one of table or query.',
			schema: ExportCsvSchema,
		},
		async ({
			file_path,
			table,
			query,
			database_name,
			delimiter,
			record_delimiter,
			encoding = 'utf8',
			always_quote = false,
			append = false,
		}) => {
			try {
				debug_log('Executing tool: export_csv', {
					file_path,
					table,
					query,
					database_name,
					delimiter,
					record_delimiter,
					encoding,
					always_quote,
					append,
				});

				if ((table && query) || (!table && !query)) {
					throw new ToolUsageError(
						'Provide exactly one of table or query for CSV export',
						[
							'Use table to export a full table',
							'Use query to export filtered/projected read-only results',
						],
					);
				}

				const database_path = setup_database_context(database_name);
				const result = await sqlite.export_csv(
					database_path,
					file_path,
					{ table, query },
					{
						delimiter,
						record_delimiter,
						encoding,
						always_quote,
						append,
					},
				);

				return create_tool_response({
					success: true,
					database: database_path,
					...result,
					message: `CSV EXPORT COMPLETED: ${result.rows_exported} rows exported to '${result.file_path}'`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);
}
