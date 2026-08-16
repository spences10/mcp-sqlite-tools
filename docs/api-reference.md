# API reference

## Database Management Tools

### `open_database`

Opens or creates a SQLite database file.

**Parameters:**

- `path` (string, required): Path to the database file
- `create` (boolean, optional): Create if doesn't exist (default:
  true)

**Example:**

```json
{
	"path": "my-app.db",
	"create": true
}
```

### `close_database`

Closes a database connection.

**Parameters:**

- `database` (string, optional): Database path to close

### `list_databases`

Lists available database files in a directory.

**Parameters:**

- `directory` (string, optional): Directory to search

### `database_info`

Gets comprehensive information about a database.

**Parameters:**

- `database` (string, optional): Database path

## Table Operations

### `list_tables`

Lists all tables and views in a database.

**Parameters:**

- `database` (string, optional): Database path

### `describe_table`

Gets schema information for a table.

**Parameters:**

- `table` (string, required): Table name
- `database` (string, optional): Database path
- `verbosity` (string, optional): 'summary' or 'detailed' (default:
  'detailed')

**Example Request:**

```json
{
	"table": "users",
	"verbosity": "detailed"
}
```

**Example Response:**

```json
{
	"database": "/tmp/demo.db",
	"table": "users",
	"columns": [
		{
			"name": "id",
			"type": "INTEGER",
			"nullable": true,
			"default_value": null,
			"primary_key": true
		},
		{
			"name": "name",
			"type": "TEXT",
			"nullable": false,
			"default_value": null,
			"primary_key": false
		},
		{
			"name": "email",
			"type": "TEXT",
			"nullable": true,
			"default_value": null,
			"primary_key": false
		},
		{
			"name": "created_at",
			"type": "TIMESTAMP",
			"nullable": true,
			"default_value": "CURRENT_TIMESTAMP",
			"primary_key": false
		}
	],
	"verbosity": "detailed",
	"column_count": 4
}
```

### `create_table`

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

### `drop_table`

Permanently deletes a table and all its data.

**Parameters:**

- `table` (string, required): Table name to delete
- `database` (string, optional): Database path

## Query Operations

### `execute_read_query`

Executes read-only SQL queries (SELECT, PRAGMA, EXPLAIN).

**Parameters:**

- `query` (string, required): SQL query
- `params` (object, optional): Query parameters
- `database` (string, optional): Database path
- `limit` (number, optional): Maximum rows to return (default: 10000)
- `offset` (number, optional): Number of rows to skip (default: 0)
- `verbosity` (string, optional): 'summary' or 'detailed' (default:
  'detailed')

**Example Request:**

```json
{
	"query": "SELECT * FROM users ORDER BY id",
	"verbosity": "detailed"
}
```

**Example Response:**

```json
{
	"database": "/tmp/demo.db",
	"query": "SELECT * FROM users ORDER BY id LIMIT 10000",
	"result": {
		"rows": [
			{
				"id": 1,
				"name": "Alice Johnson",
				"email": "alice@example.com",
				"created_at": "2025-10-03 09:42:04"
			},
			{
				"id": 3,
				"name": "Carol White",
				"email": "carol@example.com",
				"created_at": "2025-10-03 09:42:10"
			}
		],
		"changes": 0,
		"last_insert_rowid": 0
	},
	"row_count": 2,
	"pagination": {
		"limit": 10000,
		"offset": 0,
		"returned_count": 2,
		"has_more": false
	},
	"verbosity": "detailed"
}
```

### `execute_write_query`

Executes SQL that modifies data (INSERT, UPDATE, DELETE).

**Parameters:**

- `query` (string, required): SQL query
- `params` (object, optional): Query parameters
- `database` (string, optional): Database path

**Example Request:**

```json
{
	"query": "INSERT INTO users (name, email) VALUES ('Alice Smith', 'alice@example.com')"
}
```

**Example Response:**

```json
{
	"database": "/tmp/demo.db",
	"query": "INSERT INTO users (name, email) VALUES ('Alice Smith', 'alice@example.com')",
	"result": {
		"rows": [],
		"changes": 1,
		"last_insert_rowid": 1
	},
	"message": "⚠️ DESTRUCTIVE OPERATION COMPLETED: Data modified in database '/tmp/demo.db'. Rows affected: 1"
}
```

### `execute_schema_query`

Executes DDL queries (CREATE, ALTER, DROP).

**Parameters:**

- `query` (string, required): DDL SQL query
- `params` (object, optional): Query parameters
- `database` (string, optional): Database path

**Example Request:**

```json
{
	"query": "CREATE TABLE users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n)"
}
```

**Example Response:**

```json
{
	"database": "/tmp/demo.db",
	"query": "CREATE TABLE users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n)",
	"result": {
		"rows": [],
		"changes": 0,
		"last_insert_rowid": 0
	},
	"message": "⚠️ SCHEMA CHANGE COMPLETED: Database structure modified in '/tmp/demo.db'. Changes: 0"
}
```

### `bulk_insert`

Insert multiple records in batches.

**Parameters:**

- `table` (string, required): Target table name
- `data` (array, required): Array of objects to insert
- `batch_size` (number, optional): Records per batch (default: 1000)
- `database` (string, optional): Database path

**Example Request:**

```json
{
	"table": "users",
	"data": [
		{ "name": "David Lee", "email": "david@example.com" },
		{ "name": "Emma Davis", "email": "emma@example.com" },
		{ "name": "Frank Miller", "email": "frank@example.com" }
	]
}
```

**Example Response:**

```json
{
	"success": true,
	"database": "/tmp/demo.db",
	"table": "users",
	"inserted": 3,
	"batches": 1,
	"total_time": 0,
	"message": "⚠️ DESTRUCTIVE OPERATION COMPLETED: 3 records inserted into table 'users' in database '/tmp/demo.db'"
}
```

## CSV Operations

### `import_csv`

Import a headered CSV file into a table. If the table does not exist,
it is created from CSV headers with inferred SQLite column types.
Values are coerced by default (`""`/`null` to NULL, numbers to
numbers, booleans to 1/0). Row-level insert errors are reported and
successful rows continue unless `fail_fast` is true.

**Parameters:**

- `table` (string, required): Target table name
- `file_path` (string, required): CSV file path; absolute paths
  allowed
- `database_name` (string, optional): Database path or current context
  name
- `create_table` (boolean, optional): Create missing table (default:
  true)
- `batch_size` (number, optional): Rows per batch (default: 1000)
- `fail_fast` (boolean, optional): Stop on first row error (default:
  false)
- `max_errors` (number, optional): Max row errors returned
  (default: 100)
- `coerce_types` (boolean, optional): Coerce CSV strings (default:
  true)
- `delimiter`, `quote`, `escape`, `encoding` (optional): CSV parsing
  options

### `export_csv`

Export either a full table or a read-only query result to CSV. Provide
exactly one of `table` or `query`.

**Parameters:**

- `file_path` (string, required): Output CSV path; absolute paths
  allowed
- `table` (string, optional): Table to export
- `query` (string, optional): Read-only query to export
- `database_name` (string, optional): Database path or current context
  name
- `delimiter`, `record_delimiter`, `encoding` (optional): CSV output
  options
- `always_quote` (boolean, optional): Quote every field (default:
  false)
- `append` (boolean, optional): Append to existing file (default:
  false)

## Transaction Management

### `begin_transaction`

Start a database transaction with optional savepoint support.

**Parameters:**

- `database` (string, optional): Database path

**Returns:** Transaction ID for tracking

### `commit_transaction`

Commit the current transaction or release a savepoint.

**Parameters:**

- `database` (string, optional): Database path

### `rollback_transaction`

Rollback the current transaction or revert to a savepoint.

**Parameters:**

- `database` (string, optional): Database path

## Schema Operations

### `export_schema`

Export database schema to SQL or JSON format.

**Parameters:**

- `database` (string, optional): Database path
- `format` (string, optional): Output format - "sql" or "json"
  (default: "sql")
- `tables` (array, optional): Specific tables to export

**Example:**

```json
{
	"format": "json",
	"tables": ["users", "orders"]
}
```

### `import_schema`

Import and execute schema from SQL or JSON.

**Parameters:**

- `database` (string, optional): Database path
- `schema` (string, required): Schema content to import
- `format` (string, optional): Input format - "sql" or "json"
  (default: "sql")

## Database Maintenance

### `backup_database`

Creates a consistent SQLite backup using SQLite's online backup API,
including committed data that may still be in WAL files.

**Parameters:**

- `source_database` (string, optional): Source database path
- `backup_path` (string, optional): Backup file path (auto-generated
  if not provided)

### `vacuum_database`

Optimizes database storage by reclaiming unused space.

**Parameters:**

- `database` (string, optional): Database path
