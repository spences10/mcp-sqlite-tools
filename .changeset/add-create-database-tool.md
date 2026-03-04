---
'mcp-sqlite-tools': patch
---

Add `create_database` tool and change `open_database` to only open
existing databases

- `open_database` no longer silently creates new database files when
  the path doesn't exist — it now errors, preventing LLMs from
  accidentally creating empty databases when pointing to wrong paths
- New `create_database` tool explicitly creates a new empty database,
  erroring if the file already exists
- This separates intent: use `open_database` for existing databases,
  `create_database` for new ones
