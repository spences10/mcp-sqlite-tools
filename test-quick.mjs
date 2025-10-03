import { execute_schema_statements } from './dist/clients/query-executor.js';

const sql = `
CREATE TABLE IF NOT EXISTS test1 (id INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS test2 (id INTEGER PRIMARY KEY);
CREATE INDEX IF NOT EXISTS idx_test1 ON test1(id);
`;

try {
  const result = execute_schema_statements('./test-db.db', sql);
  console.log('✅ SUCCESS!');
  console.log(`Statements executed: ${result.statements_executed}`);
  console.log(`Expected: 3`);
  console.log(result.statements_executed === 3 ? '✅ PASS' : '❌ FAIL');
} catch (error) {
  console.error('❌ ERROR:', error.message);
  process.exit(1);
}
