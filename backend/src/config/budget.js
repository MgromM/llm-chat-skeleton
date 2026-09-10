import { query } from './db.js';
import { logger } from './logger.js';

/**
 * Soft monthly cost cap, configurable via MONTHLY_BUDGET_USD (empty = no
 * limit). Checked before every LLM call so the pilot can't blow through its
 * budget without a code change — just an env var.
 */
export async function checkMonthlyBudget() {
  const limit = Number(process.env.MONTHLY_BUDGET_USD);
  if (!limit || Number.isNaN(limit)) return { withinBudget: true };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { rows } = await query(
    'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM usage_metrics WHERE created_at >= $1',
    [startOfMonth.toISOString()],
  );
  const spent = Number(rows[0].total);

  if (spent >= limit) {
    logger.warn('Monthly budget exceeded', { spent, limit });
    return { withinBudget: false, spent, limit };
  }
  if (spent >= limit * 0.8) {
    logger.warn('Monthly budget at 80%+', { spent, limit });
  }
  return { withinBudget: true, spent, limit };
}
