# mcp-sqlite-tools

A Model Context Protocol (MCP) server for safe, local SQLite database
operations. It gives MCP clients explicit read, write, schema,
transaction, CSV, backup, and maintenance tools.

## Features

- Open, create, inspect, back up, vacuum, and close SQLite databases
- List, describe, create, and drop tables
- Run paginated read queries with named or positional parameters
- Run explicit write and schema queries
- Import and export headered CSV files
- Use transactions with nested savepoints
- Export and import schemas as SQL or JSON
- Restrict database and CSV paths through configuration
- Classify destructive tools for client approval policies
- Use Node's built-in SQLite driver with no native addon dependency

## Requirements

- Node.js 24.12 or later
- An MCP client with stdio server support

## Configure your MCP client

The MCP client starts this server through `npx`; a global installation
is not required.

### Install with MCPick

[MCPick](https://github.com/spences10/mcpick) can add the server to a
supported client without manual JSON editing. This command targets
Claude Code's local scope by default:

```bash
npx -y mcpick add \
  --name sqlite-tools \
  --command npx \
  --args "-y,mcp-sqlite-tools"
```

Select a client and scope explicitly when needed:

```bash
npx -y mcpick add \
  --name sqlite-tools \
  --command npx \
  --args "-y,mcp-sqlite-tools" \
  --client vscode \
  --scope project
```

The `add` command supports Claude Code, Gemini CLI, VS Code, Cursor,
Windsurf, OpenCode, and Pi. Run `npx mcpick clients` to see current
client capabilities, scopes, and configuration locations.

The examples track the latest package release. For reproducible
configuration, replace `mcp-sqlite-tools` in `--args` with an exact
version such as `mcp-sqlite-tools@x.y.z`.

### Manual configuration

For unsupported clients or advanced configuration, add the server
manually:

```json
{
	"mcpServers": {
		"mcp-sqlite-tools": {
			"command": "npx",
			"args": ["-y", "mcp-sqlite-tools"],
			"env": {
				"SQLITE_DEFAULT_PATH": ".",
				"SQLITE_ALLOW_ABSOLUTE_PATHS": "true",
				"SQLITE_BUSY_TIMEOUT": "30000",
				"SQLITE_BACKUP_PATH": "./backups"
			}
		}
	}
}
```

VS Code uses a `servers` object instead of `mcpServers`. See the
[configuration guide](https://github.com/spences10/mcp-sqlite-tools/blob/main/docs/configuration.md)
for more client-specific examples.

## Environment variables

| Variable                      | Purpose                                  | Default               |
| ----------------------------- | ---------------------------------------- | --------------------- |
| `SQLITE_DEFAULT_PATH`         | Base directory for database files        | `.`                   |
| `SQLITE_ALLOW_ABSOLUTE_PATHS` | Allow absolute database paths            | `true`                |
| `SQLITE_BACKUP_PATH`          | Default backup directory                 | Default database path |
| `SQLITE_BUSY_TIMEOUT`         | SQLite lock busy timeout in milliseconds | `30000`               |
| `DEBUG`                       | Enable diagnostic logging                | `false`               |

`SQLITE_MAX_QUERY_TIME` remains available as a deprecated alias for
`SQLITE_BUSY_TIMEOUT`. It does not limit wall-clock query runtime.

## Tools

Tools are separated by intent so MCP clients can apply clear approval
rules.

### Safe and read-only

| Tool                 | Purpose                            |
| -------------------- | ---------------------------------- |
| `open_database`      | Open an existing database          |
| `close_database`     | Close one database connection      |
| `list_databases`     | Find database files in a directory |
| `database_info`      | Read file and SQLite metadata      |
| `list_tables`        | List tables and views              |
| `describe_table`     | Read columns and constraints       |
| `backup_database`    | Create a consistent online backup  |
| `export_csv`         | Export a table or read-only query  |
| `export_schema`      | Export schema as SQL or JSON       |
| `execute_read_query` | Run one SQLite read-only statement |

### Writes, schema, and maintenance

| Tool                   | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `create_database`      | Create a new database file              |
| `create_table`         | Create a table from validated columns   |
| `drop_table`           | Drop a table and its data               |
| `execute_write_query`  | Run `INSERT`, `UPDATE`, or `DELETE`     |
| `execute_schema_query` | Run one schema statement                |
| `bulk_insert`          | Insert records in batches               |
| `import_csv`           | Import a headered CSV file              |
| `import_schema`        | Apply SQL or JSON schema objects        |
| `vacuum_database`      | Rebuild a database to reclaim space     |
| `begin_transaction`    | Begin a transaction or nested savepoint |
| `commit_transaction`   | Commit or release a savepoint           |
| `rollback_transaction` | Roll back a transaction or savepoint    |

See the
[complete API reference](https://github.com/spences10/mcp-sqlite-tools/blob/main/docs/api-reference.md)
for parameters, responses, examples, pagination, and CSV options.

## Safety model

The server does not treat every SQL string as equivalent:

- `execute_read_query` uses SQLite's authorizer API to reject writes,
  schema changes, unsafe PRAGMAs, attachment, and multiple statements.
- Write, schema, transaction, and destructive administration actions
  use separate tools so clients can request approval.
- Database and CSV paths are resolved and validated before access.
- Identifiers generated by tools are quoted.
- Values are bound as parameters rather than interpolated into SQL.
- Backups use SQLite's online backup API and include committed WAL
  data.

A client can allow read-only tools and require approval for
destructive tools. Always review SQL and file paths before approving
changes. Back up important databases before schema changes, imports,
or large writes.

## Why native SQLite?

Using `node:sqlite` removes the native addon, its install script, and
its platform-specific binaries. A clean production install fell from
31.3 MB with `better-sqlite3` to 3.6 MB with native SQLite, an 88.5%
reduction. The npm tarball itself is similar in size: 63.1 KB native
versus 60.0 KB published. The large saving is in the installed
dependency tree.

The migration also removes `better-sqlite3` and its type package. It
makes installation independent of prebuilt addon availability or a
working native compiler.

### Driver benchmark

Lower times are better. These medians use 20,000 rows, two warmups,
and seven measured runs per driver. Each sample uses a new database
and the driver order alternates. Setup is outside the measured region
except for the insert workload.

| Workload            | `node:sqlite` | `better-sqlite3` | Native result |
| ------------------- | ------------: | ---------------: | ------------: |
| Insert transaction  |      11.13 ms |         23.78 ms |  2.14× faster |
| Indexed point reads |      25.23 ms |         21.40 ms |  17.9% slower |
| Full row scan       |       6.39 ms |          3.29 ms |  94.3% slower |
| Update transaction  |       8.04 ms |         15.40 ms |  1.92× faster |
| Online backup       |       0.55 ms |          0.38 ms |  45.0% slower |

Measured on Linux x64 with Node.js 24.15.0 and an AMD Ryzen AI 9
HX 370. Node used SQLite 3.51.3; `better-sqlite3@13.0.1` used SQLite
3.53.3. These microbenchmarks show driver trade-offs, not complete MCP
performance. MCP transport and validation costs are not included.

## Development

```bash
git clone https://github.com/spences10/mcp-sqlite-tools.git
cd mcp-sqlite-tools
pnpm install
pnpm run check
pnpm test
pnpm run build
```

See
[development and architecture](https://github.com/spences10/mcp-sqlite-tools/blob/main/docs/development.md)
for module responsibilities and other development commands.

## Documentation

- [Configuration](https://github.com/spences10/mcp-sqlite-tools/blob/main/docs/configuration.md)
- [API reference](https://github.com/spences10/mcp-sqlite-tools/blob/main/docs/api-reference.md)
- [Development and architecture](https://github.com/spences10/mcp-sqlite-tools/blob/main/docs/development.md)

## Contributing

Issues and pull requests are welcome.

## License

MIT License. See [LICENSE](LICENSE).
