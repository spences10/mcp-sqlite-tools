/**
 * Transaction management for SQLite Tools MCP server
 */
import {
	convert_sqlite_error,
	with_error_handling,
} from '../common/errors.js';
import { debug_log } from '../config.js';
import { open_database } from './connection-manager.js';

// Transaction state management
interface TransactionState {
	id: string;
	database_path: string;
	start_time: Date;
	savepoint_count: number;
}

// Active transactions per database
const active_transactions = new Map<string, TransactionState>();

/**
 * Generate a unique transaction ID
 */
function generate_transaction_id(): string {
	return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Begin a new transaction
 */
export function begin_transaction(database_path: string): string {
	return with_error_handling(() => {
		// Check if transaction already exists for this database
		if (active_transactions.has(database_path)) {
			const existing = active_transactions.get(database_path)!;
			// Create a nested savepoint instead of a new transaction
			const savepoint_name = `sp_${existing.savepoint_count}`;
			const db = open_database(database_path);

			try {
				db.exec(`SAVEPOINT ${savepoint_name}`);
				existing.savepoint_count++;
				debug_log('Created savepoint:', {
					database_path,
					savepoint_name,
				});
				return existing.id;
			} catch (error) {
				throw convert_sqlite_error(error, database_path);
			}
		}

		// Start new transaction
		const transaction_id = generate_transaction_id();
		const db = open_database(database_path);

		try {
			db.exec('BEGIN IMMEDIATE');

			const transaction_state: TransactionState = {
				id: transaction_id,
				database_path,
				start_time: new Date(),
				savepoint_count: 0,
			};

			active_transactions.set(database_path, transaction_state);
			debug_log('Started transaction:', {
				database_path,
				transaction_id,
			});

			return transaction_id;
		} catch (error) {
			throw convert_sqlite_error(error, database_path);
		}
	}, 'begin_transaction')();
}

/**
 * Commit a transaction
 */
export function commit_transaction(database_path: string): {
	transaction_id: string;
	changes: number;
} {
	return with_error_handling(() => {
		const transaction = active_transactions.get(database_path);
		if (!transaction) {
			throw new Error(
				`No active transaction found for database: ${database_path}`,
			);
		}

		const db = open_database(database_path);

		try {
			// If we have savepoints, release the most recent one
			if (transaction.savepoint_count > 0) {
				const savepoint_name = `sp_${transaction.savepoint_count - 1}`;
				db.exec(`RELEASE SAVEPOINT ${savepoint_name}`);
				transaction.savepoint_count--;
				debug_log('Released savepoint:', {
					database_path,
					savepoint_name,
				});

				return { transaction_id: transaction.id, changes: 0 };
			}

			// Commit the main transaction
			db.exec('COMMIT');
			active_transactions.delete(database_path);

			debug_log('Committed transaction:', {
				database_path,
				transaction_id: transaction.id,
				duration: Date.now() - transaction.start_time.getTime(),
			});

			return { transaction_id: transaction.id, changes: 0 };
		} catch (error) {
			throw convert_sqlite_error(error, database_path);
		}
	}, 'commit_transaction')();
}

/**
 * Rollback a transaction
 */
export function rollback_transaction(database_path: string): {
	transaction_id: string;
} {
	return with_error_handling(() => {
		const transaction = active_transactions.get(database_path);
		if (!transaction) {
			throw new Error(
				`No active transaction found for database: ${database_path}`,
			);
		}

		const db = open_database(database_path);

		try {
			// If we have savepoints, rollback to the most recent one
			if (transaction.savepoint_count > 0) {
				const savepoint_name = `sp_${transaction.savepoint_count - 1}`;
				db.exec(`ROLLBACK TO SAVEPOINT ${savepoint_name}`);
				transaction.savepoint_count--;
				debug_log('Rolled back to savepoint:', {
					database_path,
					savepoint_name,
				});

				return { transaction_id: transaction.id };
			}

			// Rollback the main transaction
			db.exec('ROLLBACK');
			active_transactions.delete(database_path);

			debug_log('Rolled back transaction:', {
				database_path,
				transaction_id: transaction.id,
				duration: Date.now() - transaction.start_time.getTime(),
			});

			return { transaction_id: transaction.id };
		} catch (error) {
			throw convert_sqlite_error(error, database_path);
		}
	}, 'rollback_transaction')();
}

/**
 * Check if database has active transaction
 */
export function has_active_transaction(
	database_path: string,
): boolean {
	return active_transactions.has(database_path);
}

/**
 * Get active transaction info
 */
export function get_transaction_info(
	database_path: string,
): TransactionState | null {
	return active_transactions.get(database_path) || null;
}

/**
 * Get all active transactions (for monitoring)
 */
export function get_all_active_transactions(): Map<
	string,
	TransactionState
> {
	return new Map(active_transactions);
}

/**
 * Force cleanup of stale transactions (for error recovery)
 */
export function cleanup_stale_transactions(
	max_age_minutes: number = 30,
): number {
	const cutoff = new Date(Date.now() - max_age_minutes * 60 * 1000);
	let cleaned = 0;

	for (const [database_path, transaction] of active_transactions) {
		if (transaction.start_time < cutoff) {
			try {
				rollback_transaction(database_path);
				cleaned++;
			} catch (error) {
				debug_log('Error cleaning stale transaction:', {
					database_path,
					error,
				});
			}
		}
	}

	return cleaned;
}
