# Configuration

## MCP Client Configuration

### Option 1: Global User Configuration (Recommended)

Configure once in your VS Code user settings to work across all
workspaces. Add this to your global `mcp.json` file
(`%APPDATA%\Code\User\mcp.json` on Windows):

For VS Code global configuration, edit `~/.config/Code/User/mcp.json`
(or equivalent Windows location):

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

- ✅ **One configuration works everywhere** - no per-project setup
  needed
- 📁 **Automatically uses current workspace** - databases created in
  whatever project you have open
- 🔄 **Always up to date** - uses latest published version via npx

### Option 2: Workspace-Specific Configuration

For teams that want to share database configuration via version
control, create a `.vscode/mcp.json` file in your workspace:

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

- **Team sharing** - configuration committed to version control
- **Organized structure** - databases in a dedicated directory
- **Project isolation** - each project has its own database
  configuration

### Claude Desktop / Cline Configuration

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
				"SQLITE_BUSY_TIMEOUT": "30000",
				"SQLITE_BACKUP_PATH": "./backups"
			}
		}
	}
}
```

## Environment Variables

The following environment variables can be used to configure the MCP
server:

| Variable                      | Description                                 | Default                       | Example                        |
| ----------------------------- | ------------------------------------------- | ----------------------------- | ------------------------------ |
| `SQLITE_DEFAULT_PATH`         | Default directory for database files        | `.`                           | `${workspaceFolder}/databases` |
| `SQLITE_ALLOW_ABSOLUTE_PATHS` | Allow absolute paths in database operations | `true`                        | `false`                        |
| `SQLITE_BACKUP_PATH`          | Default directory for database backups      | Same as `SQLITE_DEFAULT_PATH` | `./backups`                    |
| `SQLITE_BUSY_TIMEOUT`         | SQLite lock busy timeout in milliseconds    | `30000`                       | `60000`                        |

`SQLITE_MAX_QUERY_TIME` is still accepted as a deprecated alias for
`SQLITE_BUSY_TIMEOUT`; it is not a wall-clock query runtime limit.

**Path Resolution:**

- Relative paths are resolved from the default path
- Use `${workspaceFolder}` in VS Code for workspace-relative paths
- Set `SQLITE_ALLOW_ABSOLUTE_PATHS=true` to enable absolute path
  operations
