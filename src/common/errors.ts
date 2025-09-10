/**
 * Error handling utilities for the SQLite Tools MCP server
 */
import { SqliteErrorCode } from './types.js';

/**
 * Custom error class for SQLite operations
 */
export class SqliteError extends Error {
	public readonly code: SqliteErrorCode;
	public readonly errno?: number;
	public readonly path?: string;

	constructor(
		message: string,
		code: SqliteErrorCode = 'SQLITE_ERROR',
		errno?: number,
		path?: string,
	) {
		super(message);
		this.name = 'SqliteError';
		this.code = code;
		if (errno !== undefined) this.errno = errno;
		if (path !== undefined) this.path = path;

		// Maintain proper stack trace for where our error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, SqliteError);
		}
	}
}

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
	public readonly field?: string;
	public readonly value?: any;

	constructor(message: string, field?: string, value?: any) {
		super(message);
		this.name = 'ValidationError';
		if (field !== undefined) this.field = field;
		if (value !== undefined) this.value = value;

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ValidationError);
		}
	}
}

/**
 * Custom error class for path security errors
 */
export class PathSecurityError extends Error {
	public readonly attemptedPath: string;

	constructor(message: string, attemptedPath: string) {
		super(message);
		this.name = 'PathSecurityError';
		this.attemptedPath = attemptedPath;

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, PathSecurityError);
		}
	}
}

/**
 * Custom error class for database connection errors
 */
export class DatabaseConnectionError extends Error {
	public readonly databasePath: string;

	constructor(message: string, databasePath: string) {
		super(message);
		this.name = 'DatabaseConnectionError';
		this.databasePath = databasePath;

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, DatabaseConnectionError);
		}
	}
}

/**
 * Convert better-sqlite3 errors to our custom error types
 */
export function convert_sqlite_error(
	error: any,
	path?: string,
): SqliteError {
	if (error instanceof SqliteError) {
		return error;
	}

	// Extract SQLite error code from better-sqlite3 error
	let code: SqliteErrorCode = 'SQLITE_ERROR';
	let errno: number | undefined;

	if (error.code) {
		// Map common better-sqlite3 error codes
		switch (error.code) {
			case 'SQLITE_BUSY':
				code = 'SQLITE_BUSY';
				break;
			case 'SQLITE_LOCKED':
				code = 'SQLITE_LOCKED';
				break;
			case 'SQLITE_READONLY':
				code = 'SQLITE_READONLY';
				break;
			case 'SQLITE_CANTOPEN':
				code = 'SQLITE_CANTOPEN';
				break;
			case 'SQLITE_CONSTRAINT':
				code = 'SQLITE_CONSTRAINT';
				break;
			case 'SQLITE_NOTADB':
				code = 'SQLITE_NOTADB';
				break;
			default:
				code = 'SQLITE_ERROR';
		}
	}

	if (typeof error.errno === 'number') {
		errno = error.errno;
	}

	return new SqliteError(
		error.message || 'Unknown SQLite error',
		code,
		errno,
		path,
	);
}

/**
 * Check if an error is a specific SQLite error code
 */
export function is_sqlite_error(
	error: any,
	code?: SqliteErrorCode,
): boolean {
	if (!(error instanceof SqliteError)) {
		return false;
	}

	if (code) {
		return error.code === code;
	}

	return true;
}

/**
 * Format error for user-friendly display
 */
export function format_error(error: any): string {
	if (error instanceof SqliteError) {
		let message = `SQLite Error (${error.code}): ${error.message}`;
		if (error.path) {
			message += ` [Path: ${error.path}]`;
		}
		return message;
	}

	if (error instanceof ValidationError) {
		let message = `Validation Error: ${error.message}`;
		if (error.field) {
			message += ` [Field: ${error.field}]`;
		}
		return message;
	}

	if (error instanceof PathSecurityError) {
		return `Path Security Error: ${error.message} [Attempted: ${error.attemptedPath}]`;
	}

	if (error instanceof DatabaseConnectionError) {
		return `Database Connection Error: ${error.message} [Database: ${error.databasePath}]`;
	}

	if (error instanceof Error) {
		return `Error: ${error.message}`;
	}

	return `Unknown error: ${String(error)}`;
}

/**
 * Wrap a function to catch and convert errors
 */
export function with_error_handling<T extends any[], R>(
	fn: (...args: T) => R,
	context?: string,
): (...args: T) => R {
	return (...args: T): R => {
		try {
			return fn(...args);
		} catch (error) {
			const contextMessage = context ? ` in ${context}` : '';

			if (
				error instanceof SqliteError ||
				error instanceof ValidationError ||
				error instanceof PathSecurityError ||
				error instanceof DatabaseConnectionError
			) {
				throw error;
			}

			// Convert unknown errors to SqliteError
			throw new SqliteError(
				`Unexpected error${contextMessage}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};
}
