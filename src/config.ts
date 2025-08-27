/**
 * Configuration management for the SQLite Tools MCP server
 */
import { resolve } from 'node:path';
import * as v from 'valibot';

// Define configuration schema using Valibot
export const ConfigSchema = v.object({
	SQLITE_DEFAULT_PATH: v.optional(v.string(), '.'),
	SQLITE_ALLOW_ABSOLUTE_PATHS: v.optional(
		v.pipe(
			v.string(),
			v.transform((val: string) => val.toLowerCase() === 'true'),
		),
	),
	SQLITE_MAX_QUERY_TIME: v.optional(
		v.pipe(
			v.string(),
			v.transform((val: string) => parseInt(val, 10)),
			v.number(),
			v.minValue(1000),
			v.maxValue(300000),
		),
	),
	SQLITE_BACKUP_PATH: v.optional(v.string(), './backups'),
	DEBUG: v.optional(
		v.pipe(
			v.string(),
			v.transform((val: string) => val.toLowerCase() === 'true'),
		),
	),
});

// Configuration type derived from schema
export type Config = v.InferOutput<typeof ConfigSchema>;

/**
 * Resolve paths relative to current working directory
 * This allows users to specify workspace-relative paths
 */
function resolveDatabasePath(path: string): string {
	// If it's already absolute, return as-is
	if (resolve(path) === path) {
		return path;
	}

	// Resolve relative to current working directory (workspace folder when run from VS Code)
	return resolve(process.cwd(), path);
}

// Parse environment variables using the schema
export function load_config(): Config {
	try {
		const raw_config = {
			SQLITE_DEFAULT_PATH: process.env['SQLITE_DEFAULT_PATH'],
			SQLITE_ALLOW_ABSOLUTE_PATHS:
				process.env['SQLITE_ALLOW_ABSOLUTE_PATHS'],
			SQLITE_MAX_QUERY_TIME: process.env['SQLITE_MAX_QUERY_TIME'],
			SQLITE_BACKUP_PATH: process.env['SQLITE_BACKUP_PATH'],
			DEBUG: process.env['DEBUG'],
		};

		const config = v.parse(ConfigSchema, raw_config);

		// Apply defaults for optional fields that weren't provided
		const configWithDefaults = {
			SQLITE_DEFAULT_PATH: config.SQLITE_DEFAULT_PATH || '.',
			SQLITE_ALLOW_ABSOLUTE_PATHS:
				config.SQLITE_ALLOW_ABSOLUTE_PATHS ?? true,
			SQLITE_MAX_QUERY_TIME: config.SQLITE_MAX_QUERY_TIME ?? 30000,
			SQLITE_BACKUP_PATH: config.SQLITE_BACKUP_PATH || './backups',
			DEBUG: config.DEBUG ?? false,
		};

		// Resolve paths relative to current working directory (workspace)
		return {
			...configWithDefaults,
			SQLITE_DEFAULT_PATH: resolveDatabasePath(
				configWithDefaults.SQLITE_DEFAULT_PATH,
			),
			SQLITE_BACKUP_PATH: resolveDatabasePath(
				configWithDefaults.SQLITE_BACKUP_PATH,
			),
		};
	} catch (error: unknown) {
		if (error instanceof v.ValiError) {
			const issues = error.issues
				.map(
					(issue: any) =>
						`${issue.path?.map((p: any) => p.key).join('.')}: ${issue.message}`,
				)
				.join(', ');
			throw new Error(
				`Configuration validation failed: ${issues}\n` +
					'Please check your environment variables or .env file.',
			);
		}
		throw error;
	}
}

// Singleton instance of the configuration
let config: Config | null = null;

// Get the configuration, loading it if necessary
export function get_config(): Config {
	if (!config) {
		config = load_config();
	}
	return config;
}

// Debug logging helper
export function debug_log(message: string, ...args: any[]): void {
	const config = get_config();
	if (config.DEBUG) {
		console.error(`[DEBUG] ${message}`, ...args);
	}
}
