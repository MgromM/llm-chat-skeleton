import { query } from './db.js';
import { logger } from './logger.js';

/**
 * Soft monthly cost caps, configurable via MONTHLY_BUDGET_USD (org-wide,
 * empty = no limit) and MONTHLY_BUDGET_PER_USER_USD (per user, empty = no
 * limit). Checked before every LLM call so the pilot can't blow through its
 * budget without a code change — just env vars. The per-user cap protects
 * the shared org budget from a single heavy user; the org cap is the
 * backstop for total spend regardless of how it's distributed.
 */
export async function checkMonthlyBudget(userId) {
  const orgLimit = Number(process.env.MONTHLY_BUDGET_USD);
  const perUserLimit = Number(process.env.MONTHLY_BUDGET_PER_USER_USD);
  const hasOrgLimit = Boolean(orgLimit) && !Number.isNaN(orgLimit);
  const hasPerUserLimit = userId != null && Boolean(perUserLimit) && !Number.isNaN(perUserLimit);
  if (!hasOrgLimit && !hasPerUserLimit) return { withinBudget: true };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [orgSpent, userSpent] = await Promise.all([
    hasOrgLimit
      ? query('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM usage_metrics WHERE created_at >= $1', [
          startOfMonth.toISOString(),
        ]).then((r) => Number(r.rows[0].total))
      : Promise.resolve(null),
    hasPerUserLimit
      ? query(
          `SELECT COALESCE(SUM(um.cost_usd), 0) AS total
           FROM usage_metrics um
           JOIN messages m ON m.id = um.message_id
           JOIN conversations c ON c.id = m.conversation_id
           WHERE c.user_id = $1 AND um.created_at >= $2`,
          [userId, startOfMonth.toISOString()],
        ).then((r) => Number(r.rows[0].total))
      : Promise.resolve(null),
  ]);

  if (hasOrgLimit && orgSpent >= orgLimit) {
    logger.warn('Monthly org budget exceeded', { spent: orgSpent, limit: orgLimit });
    return { withinBudget: false, scope: 'org', spent: orgSpent, limit: orgLimit };
  }
  if (hasPerUserLimit && userSpent >= perUserLimit) {
    logger.warn('Monthly per-user budget exceeded', { userId, spent: userSpent, limit: perUserLimit });
    return { withinBudget: false, scope: 'user', spent: userSpent, limit: perUserLimit };
  }
  if (hasOrgLimit && orgSpent >= orgLimit * 0.8) {
    logger.warn('Monthly org budget at 80%+', { spent: orgSpent, limit: orgLimit });
  }
  if (hasPerUserLimit && userSpent >= perUserLimit * 0.8) {
    logger.warn('Monthly per-user budget at 80%+', { userId, spent: userSpent, limit: perUserLimit });
  }
  return {
    withinBudget: true,
    org: hasOrgLimit ? { spent: orgSpent, limit: orgLimit } : null,
    user: hasPerUserLimit ? { spent: userSpent, limit: perUserLimit } : null,
  };
}
