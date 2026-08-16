# Development and architecture

## Building

```bash
pnpm run build
```

## Development Mode

```bash
pnpm run dev
```

## Cleaning

```bash
pnpm run clean
```

## Architecture

The server is built with a modular architecture:

### Core Modules

- **`src/index.ts`**: Main server entry point
- **`src/config.ts`**: Configuration management with Valibot
  validation

### Database Clients

- **`src/clients/connection-manager.ts`**: Advanced connection pooling
  with health monitoring
- **`src/clients/query-executor.ts`**: SQL execution, bulk operations,
  and query utilities
- **`src/clients/transaction-manager.ts`**: ACID transaction
  management with savepoints
- **`src/clients/schema-manager.ts`**: Schema export/import
  functionality
- **`src/clients/sqlite.ts`**: Main SQLite client interface and
  utilities

### Tool Handlers

- **`src/tools/handler.ts`**: Tool registration orchestrator
- **`src/tools/admin-tools.ts`**: Database and table management tools
- **`src/tools/query-tools.ts`**: Query execution and bulk operation
  tools
- **`src/tools/transaction-tools.ts`**: Transaction management tools
- **`src/tools/schema-tools.ts`**: Schema export/import tools
- **`src/tools/csv-tools.ts`**: CSV import/export tools
- **`src/tools/context.ts`**: Database context management

### Common Utilities

- **`src/common/types.ts`**: TypeScript type definitions
- **`src/common/errors.ts`**: Error handling utilities
- **`src/common/sql.ts`**: SQL identifier and literal helpers
- **`src/common/schema-sql.ts`**: SQLite schema statement parsing

This modular design provides:

- **Separation of Concerns**: Each module has a single responsibility
- **Maintainability**: Easy to test, debug, and extend individual
  components
- **Scalability**: New features can be added without affecting
  existing code
- **Type Safety**: Comprehensive TypeScript coverage throughout

## Dependencies

- **[tmcp](https://github.com/paoloricciuti/tmcp)**: Modern TypeScript
  MCP framework
- **[valibot](https://valibot.dev/)**: Lightweight validation library
  for type-safe inputs
- **[csv-parser](https://github.com/mafintosh/csv-parser)**: CSV
  import parsing
- **[csv-writer](https://github.com/ryu1kn/csv-writer)**: CSV export
  writing

### Key Features Provided by Dependencies

- **tmcp**: Streamlined MCP server development with excellent
  TypeScript support
- **node:sqlite**: Built-in synchronous SQLite operations without a
  native package dependency
- **valibot**: Runtime type validation for all tool parameters
- **csv-\***: Headered CSV import/export with type coercion and
  row-level import error reporting
