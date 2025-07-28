# mcp-sqlite-tools

A Model Context Protocol (MCP) server that provides comprehensive SQLite database operations for LLMs. This server enables AI assistants to interact with local SQLite databases safely and efficiently, with built-in security features and clear separation between read-only and destructive operations.

## Features

### 🗄️ Database Management

- **Open/Create Database**: Open existing databases or create new ones
- **Close Database**: Properly close database connections
- **List Databases**: Discover database files in directories
- **Database Info**: Get comprehensive database metadata and statistics

### 📊 Table Operations

- **List Tables**: View all tables and views in a database
- **Describe Table**: Get detailed schema information for tables
- **Create Table**: Create new tables with custom column definitions
- **Drop Table**: Remove tables (with safety warnings)

### 🔍 Query Operations

- **Execute Read Query**: Safe SELECT, PRAGMA, and EXPLAIN queries
- **Execute Write Query**: INSERT, UPDATE, DELETE operations
- **Execute Schema Query**: DDL operations (CREATE, ALTER, DROP)

### 🛠️ Database Maintenance

- **Backup Database**: Create database backups with timestamps
- **Vacuum Database**: Optimize database storage and performance

## ⚠️ Security Features

This server implements multiple layers of security:

- **Query Classification**: Automatic separation of read-only, write, and schema operations
- **Path Validation**: Prevents directory traversal attacks
- **Configurable Path Restrictions**: Control access to absolute paths
- **Input Validation**: Comprehensive parameter validation using Valibot
- **Connection Pooling**: Efficient database connection management
- **Resource Cleanup**: Automatic cleanup on server shutdown

## Installation

### From npm (when published)

```bash
npm install -g mcp-sqlite-tools
```

### From source

```bash
git clone <repository-url>
cd mcp-sqlite-tools
pnpm install
pnpm run build
```

## Configuration

### Environment Variables

The server can be configured using environment variables:

```bash
# Default directory for SQLite databases (relative to project root)
SQLITE_DEFAULT_PATH=.

# Allow absolute paths for database files (security setting)
SQLITE_ALLOW_ABSOLUTE_PATHS=true

# Maximum query execution time in milliseconds
SQLITE_MAX_QUERY_TIME=30000

# Default backup directory for database backups
SQLITE_BACKUP_PATH=./backups

# Enable debug logging
DEBUG=false
```

### MCP Client Configuration

#### Option 1: Global User Configuration (Recommended)

Configure once in your VS Code user settings to work across all workspaces. Add this to your global `mcp.json` file (`%APPDATA%\Code\User\mcp.json` on Windows):

For VS Code global configuration, edit `~/.config/Code/User/mcp.json` (or equivalent Windows location):

```json
{
  "servers": {
    "sqlite-tools": {
      "command": "npx",
      "args": ["-y", "mcp-sqlite-tools"]
    }
  }
}
```

**For WSL users**, use this format in your global config:

```json
{
  "servers": {
    "sqlite-tools": {
      "command": "wsl.exe",
      "args": ["bash", "-c", "npx -y mcp-sqlite-tools"]
    }
  }
}
```

**Benefits:**

- ✅ **One configuration works everywhere** - no per-project setup needed
- 📁 **Automatically uses current workspace** - databases created in whatever project you have open
- 🔄 **Always up to date** - uses latest published version via npx

#### Option 2: Workspace-Specific Configuration

For teams that want to share database configuration via version control, create a `.vscode/mcp.json` file in your workspace:

```json
{
  "servers": {
    "sqlite-tools": {
      "command": "npx",
      "args": ["-y", "mcp-sqlite-tools"],
      "env": {
        "SQLITE_DEFAULT_PATH": "${workspaceFolder}/databases",
        "SQLITE_ALLOW_ABSOLUTE_PATHS": "true",
        "SQLITE_BACKUP_PATH": "${workspaceFolder}/backups"
      }
    }
  }
}
```

**Benefits:**

- � **Team sharing** - configuration committed to version control
- 📂 **Organized structure** - databases in dedicated `/databases` folder
- �️ **Project isolation** - each project has its own database configuration

#### Claude Desktop / Cline Configuration

Add this to your MCP client configuration:

```json
{
  "mcpServers": {
    "mcp-sqlite-tools": {
      "command": "npx",
      "args": ["-y", "mcp-sqlite-tools"],
      "env": {
        "SQLITE_DEFAULT_PATH": ".",
        "SQLITE_ALLOW_ABSOLUTE_PATHS": "true",
        "SQLITE_MAX_QUERY_TIME": "30000",
        "SQLITE_BACKUP_PATH": "./backups"
      }
    }
  }
}
```

### Environment Variables

The following environment variables can be used to configure the MCP server:

| Variable                      | Description                                 | Default                       | Example                        |
| ----------------------------- | ------------------------------------------- | ----------------------------- | ------------------------------ |
| `SQLITE_DEFAULT_PATH`         | Default directory for database files        | `.`                           | `${workspaceFolder}/databases` |
| `SQLITE_ALLOW_ABSOLUTE_PATHS` | Allow absolute paths in database operations | `true`                        | `false`                        |
| `SQLITE_BACKUP_PATH`          | Default directory for database backups      | Same as `SQLITE_DEFAULT_PATH` | `./backups`                    |
| `SQLITE_MAX_QUERY_TIME`       | Maximum query execution time (ms)           | `30000`                       | `60000`                        |

**Path Resolution:**

- Relative paths are resolved from the default path
- Use `${workspaceFolder}` in VS Code for workspace-relative paths
- Set `SQLITE_ALLOW_ABSOLUTE_PATHS=true` to enable absolute path operations

#### Development Configuration

For development with the MCP inspector:

```bash
pnpm run build
pnpm run dev
```

## API Reference

### Database Management Tools

#### `open_database`

Opens or creates a SQLite database file.

**Parameters:**

- `path` (string, required): Path to the database file
- `create` (boolean, optional): Create if doesn't exist (default: true)

**Example:**

```json
{
  "path": "my-app.db",
  "create": true
}
```

#### `close_database`

Closes a database connection.

**Parameters:**

- `database` (string, optional): Database path to close

#### `list_databases`

Lists available database files in a directory.

**Parameters:**

- `directory` (string, optional): Directory to search

#### `database_info`

Gets comprehensive information about a database.

**Parameters:**

- `database` (string, optional): Database path

### Table Operations

#### `list_tables`

Lists all tables and views in a database.

**Parameters:**

- `database` (string, optional): Database path

#### `describe_table`

Gets schema information for a table.

**Parameters:**

- `table` (string, required): Table name
- `database` (string, optional): Database path

#### `create_table`

Creates a new table with specified columns.

**Parameters:**

- `name` (string, required): Table name
- `columns` (array, required): Column definitions
- `database` (string, optional): Database path

**Column Definition:**

```json
{
  "name": "column_name",
  "type": "TEXT|INTEGER|REAL|BLOB",
  "nullable": true,
  "primary_key": false,
  "default_value": null
}
```

**Example:**

```json
{
  "name": "users",
  "columns": [
    {
      "name": "id",
      "type": "INTEGER",
      "primary_key": true,
      "nullable": false
    },
    {
      "name": "name",
      "type": "TEXT",
      "nullable": false
    },
    {
      "name": "email",
      "type": "TEXT",
      "nullable": true
    }
  ]
}
```

#### `drop_table`

Permanently deletes a table and all its data.

**Parameters:**

- `table` (string, required): Table name to delete
- `database` (string, optional): Database path

### Query Operations

#### `execute_read_query`

Executes read-only SQL queries (SELECT, PRAGMA, EXPLAIN).

**Parameters:**

- `query` (string, required): SQL query
- `params` (object, optional): Query parameters
- `database` (string, optional): Database path

**Example:**

```json
{
  "query": "SELECT * FROM users WHERE age > ?",
  "params": { "1": 21 }
}
```

#### `execute_write_query`

Executes SQL that modifies data (INSERT, UPDATE, DELETE).

**Parameters:**

- `query` (string, required): SQL query
- `params` (object, optional): Query parameters
- `database` (string, optional): Database path

**Example:**

```json
{
  "query": "INSERT INTO users (name, email) VALUES (?, ?)",
  "params": { "1": "John Doe", "2": "john@example.com" }
}
```

#### `execute_schema_query`

Executes DDL queries (CREATE, ALTER, DROP).

**Parameters:**

- `query` (string, required): DDL SQL query
- `params` (object, optional): Query parameters
- `database` (string, optional): Database path

### Database Maintenance

#### `backup_database`

Creates a backup copy of a database.

**Parameters:**

- `source_database` (string, optional): Source database path
- `backup_path` (string, optional): Backup file path (auto-generated if not provided)

#### `vacuum_database`

Optimizes database storage by reclaiming unused space.

**Parameters:**

- `database` (string, optional): Database path

## Safety Guidelines

### Query Classification

The server automatically classifies queries into three categories:

1. **✓ SAFE**: Read-only operations (SELECT, PRAGMA, EXPLAIN)
2. **⚠️ DESTRUCTIVE**: Data modification (INSERT, UPDATE, DELETE)
3. **⚠️ SCHEMA CHANGE**: Structure modification (CREATE, ALTER, DROP)

### Best Practices

1. **Always use parameterized queries** to prevent SQL injection
2. **Review destructive operations** before execution
3. **Create backups** before major schema changes
4. **Use appropriate query tools** for different operation types
5. **Validate input data** before database operations

## Development

### Building

```bash
pnpm run build
```

### Development Mode

```bash
pnpm run dev
```

### Cleaning

```bash
pnpm run clean
```

## Architecture

The server is built with a modular architecture:

- **`src/index.ts`**: Main server entry point
- **`src/config.ts`**: Configuration management with Valibot validation
- **`src/clients/sqlite.ts`**: SQLite database client using better-sqlite3
- **`src/tools/handler.ts`**: Unified tool request handler
- **`src/tools/context.ts`**: Database context management
- **`src/common/types.ts`**: TypeScript type definitions
- **`src/common/errors.ts`**: Error handling utilities

## Dependencies

- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)**: MCP framework
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)**: High-performance SQLite driver
- **[valibot](https://valibot.dev/)**: Lightweight validation library
- **[csv-parser](https://github.com/mafintosh/csv-parser)**: CSV parsing (future feature)
- **[csv-writer](https://github.com/ryu1kn/csv-writer)**: CSV writing (future feature)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on the [Model Context Protocol](https://github.com/modelcontextprotocol)
- Inspired by [mcp-turso-cloud](https://github.com/spences10/mcp-turso-cloud)
- Uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for high-performance SQLite operations
