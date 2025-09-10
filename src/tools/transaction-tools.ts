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
	database: v.optional(v.string()),
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
			description: '⚠️ TRANSACTION: Begin a database transaction',
			schema: TransactionSchema,
		},
		async ({ database }) => {
			try {
				debug_log('Executing tool: begin_transaction', { database });

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				const transaction_id = begin_transaction(database_path);

				return create_tool_response({
					success: true,
					database: database_path,
					transaction_id,
					message: 'Transaction started successfully',
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
				'✓ TRANSACTION: Commit the current database transaction',
			schema: TransactionSchema,
		},
		async ({ database }) => {
			try {
				debug_log('Executing tool: commit_transaction', { database });

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				const result = commit_transaction(database_path);

				return create_tool_response({
					success: true,
					database: database_path,
					transaction_id: result.transaction_id,
					changes: result.changes,
					message: 'Transaction committed successfully',
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
				'⚠️ TRANSACTION: Rollback the current database transaction',
			schema: TransactionSchema,
		},
		async ({ database }) => {
			try {
				debug_log('Executing tool: rollback_transaction', {
					database,
				});

				const database_path = resolve_database_name(database);
				if (database) set_current_database(database);

				const result = rollback_transaction(database_path);

				return create_tool_response({
					success: true,
					database: database_path,
					transaction_id: result.transaction_id,
					message: 'Transaction rolled back successfully',
				});
			} catch (error) {
				return create_tool_error_response(error);
			}
		},
	);
}
