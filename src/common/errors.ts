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
 * Convert better-sqlite3 errors to our custom error types with actionable messages
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
	let enhanced_message = error.message || 'Unknown SQLite error';

	if (error.code) {
		// Map common better-sqlite3 error codes with enhanced messages
		switch (error.code) {
			case 'SQLITE_BUSY':
				code = 'SQLITE_BUSY';
				enhanced_message = `Database is busy (locked by another connection). Try again in a moment, or check if another process is using the database. Original error: ${error.message}`;
				break;
			case 'SQLITE_LOCKED':
				code = 'SQLITE_LOCKED';
				enhanced_message = `Database table is locked. This usually happens during transactions. Ensure previous transactions are committed or rolled back. Original error: ${error.message}`;
				break;
			case 'SQLITE_READONLY':
				code = 'SQLITE_READONLY';
				enhanced_message = `Database is read-only. Check file permissions or if the database is opened in read-only mode. Path: ${path || 'unknown'}. Original error: ${error.message}`;
				break;
			case 'SQLITE_CANTOPEN':
				code = 'SQLITE_CANTOPEN';
				enhanced_message = `Cannot open database file. Check if the path exists and you have the necessary permissions. For new databases, ensure the directory exists. Path: ${path || 'unknown'}. Original error: ${error.message}`;
				break;
			case 'SQLITE_CONSTRAINT':
				code = 'SQLITE_CONSTRAINT';
				enhanced_message = `Database constraint violation. This could be due to duplicate primary keys, foreign key violations, or NOT NULL constraint failures. Check your data and table schema. Original error: ${error.message}`;
				break;
			case 'SQLITE_NOTADB':
				code = 'SQLITE_NOTADB';
				enhanced_message = `File is not a valid SQLite database. The file may be corrupted, empty, or not a database file. Path: ${path || 'unknown'}. Original error: ${error.message}`;
				break;
			default:
				code = 'SQLITE_ERROR';
				enhanced_message = `SQLite error occurred. ${error.message}. If the problem persists, check your SQL syntax and data integrity.`;
		}
	}

	if (typeof error.errno === 'number') {
		errno = error.errno;
	}

	return new SqliteError(enhanced_message, code, errno, path);
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
 * Format error for user-friendly display with structured information
 */
export function format_error(error: any): string {
	if (error instanceof SqliteError) {
		return error.message; // Already enhanced with actionable information
	}

	if (error instanceof ValidationError) {
		let message = `Input validation failed: ${error.message}`;
		if (error.field && error.value !== undefined) {
			message += ` (Field: '${error.field}', Value: ${JSON.stringify(error.value)})`;
		} else if (error.field) {
			message += ` (Field: '${error.field}')`;
		}
		message += '. Please check the parameter format and constraints.';
		return message;
	}

	if (error instanceof PathSecurityError) {
		return `Path security violation: ${error.message}. Attempted path: '${error.attemptedPath}'. Ensure you're using safe, absolute paths within allowed directories.`;
	}

	if (error instanceof DatabaseConnectionError) {
		return `Cannot connect to database: ${error.message}. Database: '${error.databasePath}'. Check if the database exists and is accessible.`;
	}

	if (error instanceof Error) {
		// Handle common Node.js/system errors
		if (error.message.includes('ENOENT')) {
			return `File or directory not found: ${error.message}. Check that the path exists and is accessible.`;
		}
		if (error.message.includes('EACCES')) {
			return `Permission denied: ${error.message}. Check file/directory permissions.`;
		}
		if (error.message.includes('EEXIST')) {
			return `File or directory already exists: ${error.message}. Use a different name or remove the existing item.`;
		}
		return `Error: ${error.message}`;
	}

	return `Unknown error occurred: ${String(error)}. Please check your input and try again.`;
}

/**
 * Helper to create consistent tool responses
 */
export function create_tool_response(data: any) {
	return {
		content: [
			{
				type: 'text' as const,
				text: JSON.stringify(data, null, 2),
			},
		],
	};
}

/**
 * Helper to create consistent error responses with structured information
 */
export function create_tool_error_response(error: unknown) {
	let error_info: any = {
		error: 'execution_error',
		message: format_error(error),
	};

	// Add structured error information based on error type
	if (error instanceof SqliteError) {
		error_info.sqlite_code = error.code;
		error_info.database_path = error.path;
		error_info.error_type = 'sqlite_error';

		// Add specific suggestions based on error code
		switch (error.code) {
			case 'SQLITE_BUSY':
			case 'SQLITE_LOCKED':
				error_info.suggestions = [
					'Wait a moment and retry the operation',
					'Check if another process is using the database',
					'Ensure previous transactions are properly committed or rolled back',
				];
				break;
			case 'SQLITE_CANTOPEN':
				error_info.suggestions = [
					'Verify the database file path exists',
					'Check file and directory permissions',
					'Ensure the parent directory exists for new databases',
				];
				break;
			case 'SQLITE_CONSTRAINT':
				error_info.suggestions = [
					'Check for duplicate primary key values',
					'Verify foreign key relationships',
					'Ensure NOT NULL constraints are satisfied',
					'Review your data before insertion',
				];
				break;
			case 'SQLITE_NOTADB':
				error_info.suggestions = [
					'Verify the file is a valid SQLite database',
					'Check if the file is corrupted',
					"Ensure you're opening the correct file",
				];
				break;
		}
	} else if (error instanceof ValidationError) {
		error_info.validation_field = error.field;
		error_info.validation_value = error.value;
		error_info.error_type = 'validation_error';
		error_info.suggestions = [
			'Check the parameter format matches the expected schema',
			'Verify data types and constraints',
			'Review the tool documentation for valid parameter values',
		];
	} else if (error instanceof PathSecurityError) {
		error_info.attempted_path = error.attemptedPath;
		error_info.error_type = 'path_security_error';
		error_info.suggestions = [
			'Use absolute paths within allowed directories',
			'Avoid path traversal attempts (../ patterns)',
			'Check directory permissions and access rights',
		];
	} else if (error instanceof DatabaseConnectionError) {
		error_info.database_path = error.databasePath;
		error_info.error_type = 'connection_error';
		error_info.suggestions = [
			'Verify the database exists at the specified path',
			'Check database file permissions',
			'Ensure the database is not corrupted',
		];
	}

	return {
		content: [
			{
				type: 'text' as const,
				text: JSON.stringify(error_info, null, 2),
			},
		],
		isError: true,
	};
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
