/**
 * Database connection management for SQLite Tools MCP server
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
	DatabaseConnectionError,
	PathSecurityError,
	convert_sqlite_error,
	with_error_handling,
} from '../common/errors.js';
import { debug_log, get_config } from '../config.js';

// Connection metadata
interface ConnectionMetadata {
	database: Database.Database;
	created_at: Date;
	last_used: Date;
	use_count: number;
}

// Database connection pool with metadata
const connections = new Map<string, ConnectionMetadata>();

// Connection pool configuration
const POOL_CONFIG = {
	max_connections: 50,
	idle_timeout_minutes: 30,
	health_check_interval_minutes: 10,
};

/**
 * Validate and resolve database path
 */
export function validate_database_path(path: string): string {
	const config = get_config();

	// Check if absolute paths are allowed
	if (isAbsolute(path) && !config.SQLITE_ALLOW_ABSOLUTE_PATHS) {
		throw new PathSecurityError(
			'Absolute paths are not allowed. Set SQLITE_ALLOW_ABSOLUTE_PATHS=true to enable.',
			path,
		);
	}

	// Resolve relative paths against the default directory
	let resolved_path: string;
	if (isAbsolute(path)) {
		resolved_path = path;
	} else {
		resolved_path = resolve(config.SQLITE_DEFAULT_PATH, path);
	}

	// Security check: ensure the resolved path is within allowed directories
	if (!config.SQLITE_ALLOW_ABSOLUTE_PATHS) {
		const relative_path = relative(
			config.SQLITE_DEFAULT_PATH,
			resolved_path,
		);
		if (relative_path.startsWith('..') || isAbsolute(relative_path)) {
			throw new PathSecurityError(
				'Path traversal outside the default directory is not allowed',
				path,
			);
		}
	}

	debug_log('Validated database path:', {
		original: path,
		resolved_path,
	});
	return resolved_path;
}

/**
 * Open or create a database connection
 */
export function open_database(
	path: string,
	create: boolean = true,
): Database.Database {
	return with_error_handling(() => {
		const resolved_path = validate_database_path(path);

		// Check if database already exists in connection pool
		if (connections.has(resolved_path)) {
			const metadata = connections.get(resolved_path)!;
			metadata.last_used = new Date();
			metadata.use_count++;
			debug_log('Reusing existing database connection:', {
				path: resolved_path,
				use_count: metadata.use_count,
			});
			return metadata.database;
		}

		// Check connection pool limits
		if (connections.size >= POOL_CONFIG.max_connections) {
			cleanup_idle_connections();
			if (connections.size >= POOL_CONFIG.max_connections) {
				throw new DatabaseConnectionError(
					`Maximum connection pool size (${POOL_CONFIG.max_connections}) exceeded`,
					resolved_path,
				);
			}
		}

		// Check if file exists
		const exists = existsSync(resolved_path);
		if (!exists && !create) {
			throw new DatabaseConnectionError(
				`Database file does not exist: ${resolved_path}`,
				resolved_path,
			);
		}

		// Create directory if it doesn't exist
		if (!exists) {
			const dir = dirname(resolved_path);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
				debug_log('Created directory:', dir);
			}
		}

		try {
			// Open database connection
			const db = new Database(resolved_path);

			// Configure database for better performance and safety
			db.pragma('journal_mode = WAL');
			db.pragma('synchronous = NORMAL');
			db.pragma('cache_size = 1000');
			db.pragma('foreign_keys = ON');
			db.pragma('temp_store = MEMORY');

			// Store connection with metadata in pool
			const now = new Date();
			const metadata: ConnectionMetadata = {
				database: db,
				created_at: now,
				last_used: now,
				use_count: 1,
			};
			connections.set(resolved_path, metadata);

			debug_log('Opened database connection:', {
				path: resolved_path,
				pool_size: connections.size,
			});
			return db;
		} catch (error) {
			throw convert_sqlite_error(error, resolved_path);
		}
	}, 'open_database')();
}

/**
 * Close a database connection
 */
export function close_database(path: string): void {
	return with_error_handling(() => {
		const resolved_path = validate_database_path(path);

		const metadata = connections.get(resolved_path);
		if (metadata) {
			metadata.database.close();
			connections.delete(resolved_path);
			debug_log('Closed database connection:', {
				path: resolved_path,
				pool_size: connections.size,
			});
		}
	}, 'close_database')();
}

/**
 * Close all database connections
 */
export function close_all_databases(): void {
	for (const [path, metadata] of connections) {
		try {
			metadata.database.close();
			debug_log('Closed database connection:', path);
		} catch (error) {
			console.error('Error closing database:', path, error);
		}
	}
	connections.clear();
}

/**
 * Get current connections count (for monitoring)
 */
export function get_connection_count(): number {
	return connections.size;
}

/**
 * Get all active connection paths (for monitoring)
 */
export function get_active_connections(): string[] {
	return Array.from(connections.keys());
}

/**
 * Cleanup idle connections based on timeout
 */
export function cleanup_idle_connections(): number {
	const cutoff = new Date(
		Date.now() - POOL_CONFIG.idle_timeout_minutes * 60 * 1000,
	);
	let cleaned = 0;

	for (const [path, metadata] of connections) {
		if (metadata.last_used < cutoff) {
			try {
				metadata.database.close();
				connections.delete(path);
				cleaned++;
				debug_log('Cleaned idle connection:', {
					path,
					idle_time: Date.now() - metadata.last_used.getTime(),
				});
			} catch (error) {
				debug_log('Error cleaning idle connection:', { path, error });
			}
		}
	}

	if (cleaned > 0) {
		debug_log('Idle connection cleanup completed:', {
			cleaned,
			remaining: connections.size,
		});
	}

	return cleaned;
}

/**
 * Perform health checks on all connections
 */
export function health_check_connections(): {
	healthy: number;
	unhealthy: number;
	errors: string[];
} {
	const errors: string[] = [];
	let healthy = 0;
	let unhealthy = 0;

	for (const [path, metadata] of connections) {
		try {
			// Simple health check - try to execute a basic query
			const stmt = metadata.database.prepare('SELECT 1');
			stmt.get();
			healthy++;
		} catch (error) {
			unhealthy++;
			errors.push(`${path}: ${error}`);

			// Remove unhealthy connection
			try {
				metadata.database.close();
				connections.delete(path);
				debug_log('Removed unhealthy connection:', { path, error });
			} catch (close_error) {
				debug_log('Error removing unhealthy connection:', {
					path,
					error: close_error,
				});
			}
		}
	}

	return { healthy, unhealthy, errors };
}

/**
 * Get detailed connection pool statistics
 */
export function get_pool_stats(): {
	total_connections: number;
	max_connections: number;
	idle_timeout_minutes: number;
	oldest_connection_age: number;
	newest_connection_age: number;
	total_uses: number;
	average_uses: number;
} {
	const now = Date.now();
	let oldest_age = 0;
	let newest_age = Number.MAX_SAFE_INTEGER;
	let total_uses = 0;

	for (const metadata of connections.values()) {
		const age = now - metadata.created_at.getTime();
		oldest_age = Math.max(oldest_age, age);
		newest_age = Math.min(newest_age, age);
		total_uses += metadata.use_count;
	}

	return {
		total_connections: connections.size,
		max_connections: POOL_CONFIG.max_connections,
		idle_timeout_minutes: POOL_CONFIG.idle_timeout_minutes,
		oldest_connection_age:
			connections.size > 0 ? Math.round(oldest_age / 1000) : 0,
		newest_connection_age:
			connections.size > 0 ? Math.round(newest_age / 1000) : 0,
		total_uses,
		average_uses:
			connections.size > 0
				? Math.round(total_uses / connections.size)
				: 0,
	};
}

// Setup periodic cleanup
let cleanup_interval: NodeJS.Timeout | null = null;

/**
 * Start periodic connection maintenance
 */
export function start_connection_maintenance(): void {
	if (cleanup_interval) return;

	cleanup_interval = setInterval(
		() => {
			cleanup_idle_connections();
			health_check_connections();
		},
		POOL_CONFIG.health_check_interval_minutes * 60 * 1000,
	);

	debug_log('Started connection pool maintenance:', {
		interval_minutes: POOL_CONFIG.health_check_interval_minutes,
	});
}

/**
 * Stop periodic connection maintenance
 */
export function stop_connection_maintenance(): void {
	if (cleanup_interval) {
		clearInterval(cleanup_interval);
		cleanup_interval = null;
		debug_log('Stopped connection pool maintenance');
	}
}

// Cleanup on process exit
const cleanup_handler = () => {
	stop_connection_maintenance();
	close_all_databases();
};

process.on('exit', cleanup_handler);
process.on('SIGINT', cleanup_handler);
process.on('SIGTERM', cleanup_handler);

// Start connection maintenance when module loads
start_connection_maintenance();
