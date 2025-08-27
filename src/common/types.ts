/**
 * Common type definitions for the SQLite Tools MCP server
 */

// SQLite query result types
export interface QueryResult {
	rows: Record<string, any>[];
	changes: number;
	lastInsertRowid: number | bigint;
}

// Table column information
export interface ColumnInfo {
	cid: number;
	name: string;
	type: string;
	notnull: number;
	dflt_value: any;
	pk: number;
}

// Table information
export interface TableInfo {
	name: string;
	type: string;
	sql: string;
}

// Database information
export interface DatabaseInfo {
	path: string;
	size: number;
	tables: number;
	pageSize: number;
	pageCount: number;
	encoding: string;
	userVersion: number;
}

// Backup information
export interface BackupInfo {
	source: string;
	destination: string;
	timestamp: string;
	size: number;
}

// CSV import/export options
export interface CsvOptions {
	delimiter?: string;
	quote?: string;
	escape?: string;
	headers?: boolean;
	encoding?: string;
}

// Query execution context
export interface QueryContext {
	database?: string;
	timeout?: number;
	readonly?: boolean;
}

// Tool input schemas (for Valibot validation)
export interface OpenDatabaseInput {
	path: string;
	create?: boolean;
}

export interface ExecuteQueryInput {
	query: string;
	params?: Record<string, any>;
	database?: string;
}

export interface CreateTableInput {
	name: string;
	columns: Array<{
		name: string;
		type: string;
		nullable?: boolean;
		primary_key?: boolean;
		default_value?: any;
	}>;
	database?: string;
}

export interface DescribeTableInput {
	table: string;
	database?: string;
}

export interface ImportCsvInput {
	table: string;
	file_path: string;
	options?: CsvOptions;
	database?: string;
}

export interface ExportCsvInput {
	table: string;
	file_path: string;
	query?: string;
	options?: CsvOptions;
	database?: string;
}

export interface BackupDatabaseInput {
	source_database?: string;
	backup_path?: string;
}

// Error types
export type SqliteErrorCode =
	| 'SQLITE_ERROR'
	| 'SQLITE_BUSY'
	| 'SQLITE_LOCKED'
	| 'SQLITE_NOMEM'
	| 'SQLITE_READONLY'
	| 'SQLITE_INTERRUPT'
	| 'SQLITE_IOERR'
	| 'SQLITE_CORRUPT'
	| 'SQLITE_NOTFOUND'
	| 'SQLITE_FULL'
	| 'SQLITE_CANTOPEN'
	| 'SQLITE_PROTOCOL'
	| 'SQLITE_EMPTY'
	| 'SQLITE_SCHEMA'
	| 'SQLITE_TOOBIG'
	| 'SQLITE_CONSTRAINT'
	| 'SQLITE_MISMATCH'
	| 'SQLITE_MISUSE'
	| 'SQLITE_NOLFS'
	| 'SQLITE_AUTH'
	| 'SQLITE_FORMAT'
	| 'SQLITE_RANGE'
	| 'SQLITE_NOTADB';
