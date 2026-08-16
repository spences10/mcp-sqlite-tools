import {
	DatabaseSync,
	StatementSync,
	backup,
	constants,
} from 'node:sqlite';

export type SqliteValue =
	| string
	| number
	| bigint
	| Uint8Array
	| null;
export type SqliteParameters =
	| Record<string, SqliteValue>
	| unknown[]
	| SqliteValue
	| undefined;

export interface RunResult {
	changes: number;
	lastInsertRowid: number;
}

const READ_ONLY_PRAGMAS = new Set([
	'application_id',
	'collation_list',
	'compile_options',
	'database_list',
	'data_version',
	'encoding',
	'foreign_key_check',
	'foreign_key_list',
	'freelist_count',
	'function_list',
	'index_info',
	'index_list',
	'index_xinfo',
	'integrity_check',
	'journal_mode',
	'module_list',
	'page_count',
	'page_size',
	'pragma_list',
	'quick_check',
	'schema_version',
	'table_info',
	'table_list',
	'table_xinfo',
	'user_version',
]);

const ARGUMENT_READ_ONLY_PRAGMAS = new Set([
	'foreign_key_check',
	'foreign_key_list',
	'index_info',
	'index_list',
	'index_xinfo',
	'integrity_check',
	'quick_check',
	'table_info',
	'table_xinfo',
]);

const WRITE_ACTIONS = new Set(
	[
		'SQLITE_CREATE_INDEX',
		'SQLITE_CREATE_TABLE',
		'SQLITE_CREATE_TEMP_INDEX',
		'SQLITE_CREATE_TEMP_TABLE',
		'SQLITE_CREATE_TEMP_TRIGGER',
		'SQLITE_CREATE_TEMP_VIEW',
		'SQLITE_CREATE_TRIGGER',
		'SQLITE_CREATE_VIEW',
		'SQLITE_DELETE',
		'SQLITE_DROP_INDEX',
		'SQLITE_DROP_TABLE',
		'SQLITE_DROP_TEMP_INDEX',
		'SQLITE_DROP_TEMP_TABLE',
		'SQLITE_DROP_TEMP_TRIGGER',
		'SQLITE_DROP_TEMP_VIEW',
		'SQLITE_DROP_TRIGGER',
		'SQLITE_DROP_VIEW',
		'SQLITE_INSERT',
		'SQLITE_PRAGMA',
		'SQLITE_TRANSACTION',
		'SQLITE_UPDATE',
		'SQLITE_ATTACH',
		'SQLITE_DETACH',
		'SQLITE_ALTER_TABLE',
		'SQLITE_REINDEX',
		'SQLITE_ANALYZE',
		'SQLITE_CREATE_VTABLE',
		'SQLITE_DROP_VTABLE',
		'SQLITE_SAVEPOINT',
	]
		.map((name) => constants[name as keyof typeof constants])
		.filter((value): value is number => typeof value === 'number'),
);

function bind_args(params: SqliteParameters): SqliteValue[] {
	if (params === undefined) return [];
	return (Array.isArray(params) ? params : [params]) as SqliteValue[];
}

function has_sql_tail(tail: string): boolean {
	let remaining = tail;
	while (remaining.length > 0) {
		remaining = remaining.trimStart();
		if (remaining.startsWith('--')) {
			const newline = remaining.indexOf('\n');
			remaining = newline === -1 ? '' : remaining.slice(newline + 1);
			continue;
		}
		if (remaining.startsWith('/*')) {
			const end = remaining.indexOf('*/', 2);
			if (end === -1) return true;
			remaining = remaining.slice(end + 2);
			continue;
		}
		return remaining.length > 0;
	}
	return false;
}

export class SqliteStatement {
	readonly readonly: boolean;
	constructor(
		private readonly statement: StatementSync,
		readonly_statement: boolean,
	) {
		this.readonly = readonly_statement;
	}

	run(params?: SqliteParameters): RunResult {
		const result = this.statement.run(...bind_args(params));
		return {
			changes: Number(result.changes),
			lastInsertRowid: Number(result.lastInsertRowid),
		};
	}

	get(
		params?: SqliteParameters,
	): Record<string, unknown> | unknown[] | undefined {
		return this.statement.get(...bind_args(params));
	}

	all(
		params?: SqliteParameters,
	): Array<Record<string, unknown> | unknown[]> {
		return this.statement.all(...bind_args(params));
	}

	columns(): ReturnType<StatementSync['columns']> {
		return this.statement.columns();
	}

	raw(enabled = true): this {
		this.statement.setReturnArrays(enabled);
		return this;
	}
}

export class SqliteDatabase {
	private readonly database: DatabaseSync;

	constructor(path: string, options: { timeout?: number } = {}) {
		this.database = new DatabaseSync(path, {
			timeout: options.timeout,
		});
		this.database.enableDefensive(true);
	}

	prepare(sql: string): SqliteStatement {
		let readonly_statement = true;
		this.database.setAuthorizer((action_code, arg1, arg2) => {
			const is_read_only_pragma =
				action_code === constants.SQLITE_PRAGMA &&
				typeof arg1 === 'string' &&
				READ_ONLY_PRAGMAS.has(arg1.toLowerCase()) &&
				(arg2 === null ||
					ARGUMENT_READ_ONLY_PRAGMAS.has(arg1.toLowerCase()));
			if (WRITE_ACTIONS.has(action_code) && !is_read_only_pragma) {
				readonly_statement = false;
			}
			return constants.SQLITE_OK;
		});

		try {
			const statement = this.database.prepare(sql);
			if (has_sql_tail(sql.slice(statement.sourceSQL.length))) {
				throw new Error('Query contains more than one statement');
			}
			return new SqliteStatement(statement, readonly_statement);
		} finally {
			this.database.setAuthorizer(null);
		}
	}

	exec(sql: string): void {
		this.database.exec(sql);
	}

	pragma(
		pragma: string,
		options: { simple?: boolean } = {},
	): unknown {
		const statement = this.database.prepare(`PRAGMA ${pragma}`);
		if (options.simple) {
			const row = statement.get();
			return row ? Object.values(row)[0] : undefined;
		}
		return statement.all();
	}

	async backup(destination: string): Promise<void> {
		await backup(this.database, destination);
	}

	close(): void {
		this.database.close();
	}

	get open(): boolean {
		return this.database.isOpen;
	}
}
