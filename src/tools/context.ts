/**
 * Database context management for the SQLite Tools MCP server
 */
import { validate_database_path } from '../clients/sqlite.js';
import { debug_log, get_config } from '../config.js';

// Current database context
let current_database: string | null = null;

/**
 * Set the current database context
 */
export function set_current_database(databasePath: string): void {
	// Validate the path before setting it
	const resolved_path = validate_database_path(databasePath);
	current_database = resolved_path;
	debug_log('Set current database context:', resolved_path);
}

/**
 * Get the current database context
 */
export function get_current_database(): string | null {
	return current_database;
}

/**
 * Clear the current database context
 */
export function clear_current_database(): void {
	debug_log('Cleared current database context');
	current_database = null;
}

/**
 * Resolve database name using context or default
 */
export function resolve_database_name(
	database_path?: string,
): string {
	if (database_path) {
		// Use provided database path
		return validate_database_path(database_path);
	}

	if (current_database) {
		// Use current context
		debug_log('Using current database context:', current_database);
		return current_database;
	}

	if (process.env['SQLITE_DEFAULT_DATABASE']) {
		const default_path = validate_database_path(
			process.env['SQLITE_DEFAULT_DATABASE'],
		);
		debug_log('Using default database:', default_path);
		return default_path;
	}

	// Fallback to a default name
	const fallback_path = validate_database_path('default.db');
	debug_log('Using fallback database:', fallback_path);
	return fallback_path;
}

/**
 * Get context information for debugging
 */
export function get_context_info(): {
	current_database: string | null;
	default_database: string | null;
	default_path: string;
} {
	const config = get_config();
	return {
		current_database: current_database,
		default_database: process.env['SQLITE_DEFAULT_DATABASE'] || null,
		default_path: config.SQLITE_DEFAULT_PATH,
	};
}
