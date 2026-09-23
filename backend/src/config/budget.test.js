import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const dbMock = mock.module('./db.js', {
  exports: { query: mock.fn() },
});

const { query } = await import('./db.js');
const { checkMonthlyBudget } = await import('./budget.js');

test.beforeEach(() => {
  query.mock.resetCalls();
  delete process.env.MONTHLY_BUDGET_USD;
  delete process.env.MONTHLY_BUDGET_PER_USER_USD;
});

test('no limits set means no limit', async () => {
  const result = await checkMonthlyBudget(1);
  assert.deepEqual(result, { withinBudget: true });
  assert.equal(query.mock.callCount(), 0);
});

test('org spend below the limit stays within budget', async () => {
  process.env.MONTHLY_BUDGET_USD = '20';
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '10.50' }] }));
  const result = await checkMonthlyBudget();
  assert.deepEqual(result, { withinBudget: true, org: { spent: 10.5, limit: 20 }, user: null });
});

test('org spend at or above the limit blocks the turn', async () => {
  process.env.MONTHLY_BUDGET_USD = '20';
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '20.00' }] }));
  const result = await checkMonthlyBudget();
  assert.deepEqual(result, { withinBudget: false, scope: 'org', spent: 20, limit: 20 });
});

test('org spend just over the limit blocks the turn', async () => {
  process.env.MONTHLY_BUDGET_USD = '20';
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '20.01' }] }));
  const result = await checkMonthlyBudget();
  assert.equal(result.withinBudget, false);
  assert.equal(result.scope, 'org');
});

test('no userId means the per-user cap is skipped even if configured', async () => {
  process.env.MONTHLY_BUDGET_PER_USER_USD = '20';
  const result = await checkMonthlyBudget();
  assert.deepEqual(result, { withinBudget: true });
  assert.equal(query.mock.callCount(), 0);
});

test('per-user spend below the limit stays within budget', async () => {
  process.env.MONTHLY_BUDGET_PER_USER_USD = '20';
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '5.25' }] }));
  const result = await checkMonthlyBudget(42);
  assert.deepEqual(result, { withinBudget: true, org: null, user: { spent: 5.25, limit: 20 } });
});

test('per-user spend at or above the limit blocks the turn, independent of org budget', async () => {
  process.env.MONTHLY_BUDGET_USD = '1000';
  process.env.MONTHLY_BUDGET_PER_USER_USD = '20';
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '1.00' }] }), 0); // org spend, well under limit
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '20.00' }] }), 1); // this user's spend
  const result = await checkMonthlyBudget(42);
  assert.deepEqual(result, { withinBudget: false, scope: 'user', spent: 20, limit: 20 });
});

test('org limit still blocks even when the per-user cap is within bounds', async () => {
  process.env.MONTHLY_BUDGET_USD = '20';
  process.env.MONTHLY_BUDGET_PER_USER_USD = '100';
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '20.00' }] }), 0); // org spend
  query.mock.mockImplementationOnce(async () => ({ rows: [{ total: '2.00' }] }), 1); // this user's spend
  const result = await checkMonthlyBudget(42);
  assert.deepEqual(result, { withinBudget: false, scope: 'org', spent: 20, limit: 20 });
});
