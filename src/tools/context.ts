/**
 * Database context management for the SQLite Tools MCP server
 */
import { validateDatabasePath } from '../clients/sqlite.js';
import { debug_log, get_config } from '../config.js';

// Current database context
let currentDatabase: string | null = null;

/**
 * Set the current database context
 */
export function setCurrentDatabase(databasePath: string): void {
	// Validate the path before setting it
	const resolvedPath = validateDatabasePath(databasePath);
	currentDatabase = resolvedPath;
	debug_log('Set current database context:', resolvedPath);
}

/**
 * Get the current database context
 */
export function getCurrentDatabase(): string | null {
	return currentDatabase;
}

/**
 * Clear the current database context
 */
export function clearCurrentDatabase(): void {
	debug_log('Cleared current database context');
	currentDatabase = null;
}

/**
 * Resolve database name using context or default
 */
export function resolveDatabaseName(databasePath?: string): string {
	if (databasePath) {
		// Use provided database path
		return validateDatabasePath(databasePath);
	}

	if (currentDatabase) {
		// Use current context
		debug_log('Using current database context:', currentDatabase);
		return currentDatabase;
	}

	// Use default database if configured
	const config = get_config();
	if (process.env['SQLITE_DEFAULT_DATABASE']) {
		const defaultPath = validateDatabasePath(
			process.env['SQLITE_DEFAULT_DATABASE'],
		);
		debug_log('Using default database:', defaultPath);
		return defaultPath;
	}

	// Fallback to a default name
	const fallbackPath = validateDatabasePath('default.db');
	debug_log('Using fallback database:', fallbackPath);
	return fallbackPath;
}

/**
 * Get context information for debugging
 */
export function getContextInfo(): {
	currentDatabase: string | null;
	defaultDatabase: string | null;
	defaultPath: string;
} {
	const config = get_config();
	return {
		currentDatabase,
		defaultDatabase: process.env['SQLITE_DEFAULT_DATABASE'] || null,
		defaultPath: config.SQLITE_DEFAULT_PATH,
	};
}
