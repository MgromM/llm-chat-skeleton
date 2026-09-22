import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const dbMock = mock.module('./db.js', {
  exports: { query: mock.fn() },
});

const { query } = await import('./db.js');
const { checkMonthlyBudget } = await import('./budget.js');

test.beforeEach(() => {
  query.mock.resetCalls();
});

test('no MONTHLY_BUDGET_USD set means no limit', async () => {
  delete process.env.MONTHLY_BUDGET_USD;
  const result = await checkMonthlyBudget();
  assert.deepEqual(result, { withinBudget: true });
  assert.equal(query.mock.callCount(), 0);
});

test('spend below the limit stays within budget', async () => {
  process.env.MONTHLY_BUDGET_USD = '20';
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '10.50' }] }));
  const result = await checkMonthlyBudget();
  assert.deepEqual(result, { withinBudget: true, spent: 10.5, limit: 20 });
});

test('spend at or above the limit blocks the turn', async () => {
  process.env.MONTHLY_BUDGET_USD = '20';
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '20.00' }] }));
  const result = await checkMonthlyBudget();
  assert.deepEqual(result, { withinBudget: false, spent: 20, limit: 20 });
});

test('spend just over the limit blocks the turn', async () => {
  process.env.MONTHLY_BUDGET_USD = '20';
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '20.01' }] }));
  const result = await checkMonthlyBudget();
  assert.equal(result.withinBudget, false);
});
