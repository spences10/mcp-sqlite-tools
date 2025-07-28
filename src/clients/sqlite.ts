/**
 * SQLite database client using better-sqlite3
 */
import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  DatabaseConnectionError,
  PathSecurityError,
  convertSqliteError,
  withErrorHandling,
} from "../common/errors.js";
import {
  BackupInfo,
  ColumnInfo,
  DatabaseInfo,
  QueryResult,
  TableInfo,
} from "../common/types.js";
import { debug_log, get_config } from "../config.js";

// Database connection pool
const connections = new Map<string, Database.Database>();

/**
 * Validate and resolve database path
 */
export function validateDatabasePath(path: string): string {
  const config = get_config();

  // Check if absolute paths are allowed
  if (isAbsolute(path) && !config.SQLITE_ALLOW_ABSOLUTE_PATHS) {
    throw new PathSecurityError(
      "Absolute paths are not allowed. Set SQLITE_ALLOW_ABSOLUTE_PATHS=true to enable.",
      path
    );
  }

  // Resolve relative paths against the default directory
  let resolvedPath: string;
  if (isAbsolute(path)) {
    resolvedPath = path;
  } else {
    resolvedPath = resolve(config.SQLITE_DEFAULT_PATH, path);
  }

  // Security check: ensure the resolved path is within allowed directories
  if (!config.SQLITE_ALLOW_ABSOLUTE_PATHS) {
    const relativePath = relative(config.SQLITE_DEFAULT_PATH, resolvedPath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new PathSecurityError(
        "Path traversal outside the default directory is not allowed",
        path
      );
    }
  }

  debug_log("Validated database path:", {
    original: path,
    resolved: resolvedPath,
  });
  return resolvedPath;
}

/**
 * Open or create a database connection
 */
export function openDatabase(
  path: string,
  create: boolean = true
): Database.Database {
  return withErrorHandling(() => {
    const resolvedPath = validateDatabasePath(path);

    // Check if database already exists in connection pool
    if (connections.has(resolvedPath)) {
      debug_log("Reusing existing database connection:", resolvedPath);
      return connections.get(resolvedPath)!;
    }

    // Check if file exists
    const exists = existsSync(resolvedPath);
    if (!exists && !create) {
      throw new DatabaseConnectionError(
        `Database file does not exist: ${resolvedPath}`,
        resolvedPath
      );
    }

    // Create directory if it doesn't exist
    if (!exists) {
      const dir = dirname(resolvedPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        debug_log("Created directory:", dir);
      }
    }

    try {
      // Open database connection
      const db = new Database(resolvedPath);

      // Configure database for better performance and safety
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      db.pragma("cache_size = 1000");
      db.pragma("foreign_keys = ON");
      db.pragma("temp_store = MEMORY");

      // Store connection in pool
      connections.set(resolvedPath, db);

      debug_log("Opened database connection:", resolvedPath);
      return db;
    } catch (error) {
      throw convertSqliteError(error, resolvedPath);
    }
  }, "openDatabase")();
}

/**
 * Close a database connection
 */
export function closeDatabase(path: string): void {
  return withErrorHandling(() => {
    const resolvedPath = validateDatabasePath(path);

    const db = connections.get(resolvedPath);
    if (db) {
      db.close();
      connections.delete(resolvedPath);
      debug_log("Closed database connection:", resolvedPath);
    }
  }, "closeDatabase")();
}

/**
 * Close all database connections
 */
export function closeAllDatabases(): void {
  for (const [path, db] of connections) {
    try {
      db.close();
      debug_log("Closed database connection:", path);
    } catch (error) {
      console.error("Error closing database:", path, error);
    }
  }
  connections.clear();
}

/**
 * Execute a SQL query
 */
export function executeQuery(
  databasePath: string,
  query: string,
  params: Record<string, any> = {}
): QueryResult {
  return withErrorHandling(() => {
    const db = openDatabase(databasePath);

    try {
      debug_log("Executing query:", { query, params });

      // Prepare and execute the statement
      const stmt = db.prepare(query);
      const result = stmt.run(params);

      return {
        rows: [],
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
    } catch (error) {
      throw convertSqliteError(error, databasePath);
    }
  }, "executeQuery")();
}

/**
 * Execute a SELECT query and return rows
 */
export function executeSelectQuery(
  databasePath: string,
  query: string,
  params: Record<string, any> = {}
): QueryResult {
  return withErrorHandling(() => {
    const db = openDatabase(databasePath);

    try {
      debug_log("Executing select query:", { query, params });

      // Prepare and execute the statement
      const stmt = db.prepare(query);
      const rows = stmt.all(params);

      return {
        rows: rows as Record<string, any>[],
        changes: 0,
        lastInsertRowid: 0,
      };
    } catch (error) {
      throw convertSqliteError(error, databasePath);
    }
  }, "executeSelectQuery")();
}

/**
 * List all tables in the database
 */
export function listTables(databasePath: string): TableInfo[] {
  return withErrorHandling(() => {
    const result = executeSelectQuery(
      databasePath,
      "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name"
    );

    return result.rows as TableInfo[];
  }, "listTables")();
}

/**
 * Get table schema information
 */
export function describeTable(
  databasePath: string,
  tableName: string
): ColumnInfo[] {
  return withErrorHandling(() => {
    const result = executeSelectQuery(
      databasePath,
      `PRAGMA table_info(${tableName})`
    );

    return result.rows as ColumnInfo[];
  }, "describeTable")();
}

/**
 * Get database information
 */
export function getDatabaseInfo(databasePath: string): DatabaseInfo {
  return withErrorHandling(() => {
    const resolvedPath = validateDatabasePath(databasePath);
    const db = openDatabase(databasePath);

    try {
      // Get file size
      const stats = statSync(resolvedPath);

      // Get database metadata
      const pageSize = db.pragma("page_size", { simple: true }) as number;
      const pageCount = db.pragma("page_count", { simple: true }) as number;
      const encoding = db.pragma("encoding", { simple: true }) as string;
      const userVersion = db.pragma("user_version", { simple: true }) as number;

      // Count tables
      const tables = listTables(databasePath);

      return {
        path: resolvedPath,
        size: stats.size,
        tables: tables.length,
        pageSize,
        pageCount,
        encoding,
        userVersion,
      };
    } catch (error) {
      throw convertSqliteError(error, resolvedPath);
    }
  }, "getDatabaseInfo")();
}

/**
 * Create a backup of the database
 */
export function backupDatabase(
  sourcePath: string,
  backupPath?: string
): BackupInfo {
  return withErrorHandling(() => {
    const config = get_config();
    const resolvedSourcePath = validateDatabasePath(sourcePath);

    // Generate backup path if not provided
    let resolvedBackupPath: string;
    if (backupPath) {
      resolvedBackupPath = validateDatabasePath(backupPath);
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const baseName =
        resolvedSourcePath.split("/").pop()?.replace(".db", "") || "database";
      resolvedBackupPath = resolve(
        config.SQLITE_BACKUP_PATH,
        `${baseName}-${timestamp}.db`
      );
    }

    // Ensure backup directory exists
    const backupDir = dirname(resolvedBackupPath);
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    try {
      // Copy the database file
      copyFileSync(resolvedSourcePath, resolvedBackupPath);

      // Get backup file size
      const stats = statSync(resolvedBackupPath);

      const backupInfo: BackupInfo = {
        source: resolvedSourcePath,
        destination: resolvedBackupPath,
        timestamp: new Date().toISOString(),
        size: stats.size,
      };

      debug_log("Created database backup:", backupInfo);
      return backupInfo;
    } catch (error) {
      throw convertSqliteError(error, resolvedSourcePath);
    }
  }, "backupDatabase")();
}

/**
 * Vacuum the database to optimize storage
 */
export function vacuumDatabase(databasePath: string): void {
  return withErrorHandling(() => {
    const db = openDatabase(databasePath);

    try {
      debug_log("Vacuuming database:", databasePath);
      db.exec("VACUUM");
    } catch (error) {
      throw convertSqliteError(error, databasePath);
    }
  }, "vacuumDatabase")();
}

/**
 * Check if a query is read-only
 */
export function isReadOnlyQuery(query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  // Allow SELECT and PRAGMA statements
  return (
    normalizedQuery.startsWith("select") ||
    normalizedQuery.startsWith("pragma") ||
    normalizedQuery.startsWith("explain")
  );
}

/**
 * Check if a query is a schema modification
 */
export function isSchemaQuery(query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  return (
    normalizedQuery.startsWith("create") ||
    normalizedQuery.startsWith("drop") ||
    normalizedQuery.startsWith("alter")
  );
}

// Cleanup on process exit
process.on("exit", closeAllDatabases);
process.on("SIGINT", closeAllDatabases);
process.on("SIGTERM", closeAllDatabases);
