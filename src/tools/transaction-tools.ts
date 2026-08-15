/**
 * Transaction management tools for the SQLite Tools MCP server
 */
import { McpServer } from 'tmcp';
import * as v from 'valibot';
import {
	begin_transaction,
	commit_transaction,
	rollback_transaction,
} from '../clients/transaction-manager.js';
import {
	create_tool_error_response,
	create_tool_response,
} from '../common/errors.js';
import { debug_log } from '../config.js';
import {
	resolve_database_name,
	set_current_database,
} from './context.js';

// Input validation schemas
const TransactionSchema = v.object({
	database_name: v.optional(v.pipe(v.string(), v.maxLength(255))),
});

/**
 * Register transaction management tools with the server
 */
export function register_transaction_tools(
	server: McpServer<any>,
): void {
	server.tool<typeof TransactionSchema>(
		{
			name: 'begin_transaction',
			description:
				'⚠️ TRANSACTION: Begin transaction; holds locks until end.',
			schema: TransactionSchema,
		},
		async ({ database_name }) => {
			try {
				debug_log('Executing tool: begin_transaction', {
					database_name,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				const transaction_id = begin_transaction(database_path);

				return create_tool_response({
					success: true,
					database: database_path,
					transaction_id,
					message: `🔒 TRANSACTION STARTED: Database '${database_path}' - ID: ${transaction_id}`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof TransactionSchema>(
		{
			name: 'commit_transaction',
			description:
				'✓ TRANSACTION: Commit transaction and release locks.',
			schema: TransactionSchema,
		},
		async ({ database_name }) => {
			try {
				debug_log('Executing tool: commit_transaction', {
					database_name,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				const result = commit_transaction(database_path);

				return create_tool_response({
					success: true,
					database: database_path,
					transaction_id: result.transaction_id,
					changes: result.changes,
					message: `✅ TRANSACTION COMMITTED: Database '${database_path}' - ID: ${result.transaction_id} - Changes: ${result.changes}`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);

	server.tool<typeof TransactionSchema>(
		{
			name: 'rollback_transaction',
			description:
				'⚠️ TRANSACTION: Roll back transaction and release locks.',
			schema: TransactionSchema,
		},
		async ({ database_name }) => {
			try {
				debug_log('Executing tool: rollback_transaction', {
					database_name,
				});

				const database_path = resolve_database_name(database_name);
				if (database_name) set_current_database(database_name);

				const result = rollback_transaction(database_path);

				return create_tool_response({
					success: true,
					database: database_path,
					transaction_id: result.transaction_id,
					message: `🔄 TRANSACTION ROLLED BACK: Database '${database_path}' - ID: ${result.transaction_id} - All changes reverted`,
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);
}
