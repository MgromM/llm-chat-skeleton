import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getCostSummary } from '../services/metrics/usageTracker.js';
import { query } from '../config/db.js';
import { checkBigQueryConnection } from '../services/mcp/bigqueryServer.js';

export const metricsRouter = Router();
metricsRouter.use(requireAuth, requireRole('manager', 'admin'));

// Diagnostic for admins to confirm the BigQuery service account/dataset is
// wired up correctly, without needing to go through the chat/LLM path.
metricsRouter.get('/bigquery-status', async (req, res, next) => {
  try {
    res.json(await checkBigQueryConnection());
  } catch (err) {
    next(err);
  }
});

metricsRouter.get('/leak-alerts', async (req, res, next) => {
  try {
    const onlyUnreviewed = req.query.reviewed === 'false';
    const { rows } = await query(
      `SELECT la.id, la.conversation_id, la.user_id, u.email, la.category, la.confidence,
              la.rationale, la.context, la.judge_model, la.reviewed, la.created_at
       FROM leak_alerts la
       JOIN users u ON u.id = la.user_id
       ${onlyUnreviewed ? 'WHERE la.reviewed = false' : ''}
       ORDER BY la.created_at DESC`,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

metricsRouter.post('/leak-alerts/:id/review', async (req, res, next) => {
  try {
    const { rows } = await query(
      'UPDATE leak_alerts SET reviewed = true WHERE id = $1 RETURNING id',
      [req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

function parseRange(req) {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

metricsRouter.get('/costs', async (req, res, next) => {
  try {
    res.json(await getCostSummary(parseRange(req)));
  } catch (err) {
    next(err);
  }
});

metricsRouter.get('/quality', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const { rows } = await query(
      `SELECT judge_model, ROUND(AVG(score), 2) AS avg_score, COUNT(*) AS scored_messages
       FROM quality_scores
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY judge_model`,
      [from, to],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Compares our own tool's actual cost against the known enterprise seat
// price, so the dashboard can answer "is this worth building" directly.
metricsRouter.get('/enterprise-comparison', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const seatCost = Number(process.env.ENTERPRISE_SEAT_COST_USD ?? 0);
    const seats = Number(process.env.ENTERPRISE_SEATS ?? 0);

    const { rows } = await query(
      `SELECT COALESCE(SUM(um.cost_usd), 0) AS total_cost,
              COUNT(DISTINCT m.conversation_id) AS active_conversations
       FROM usage_metrics um
       JOIN messages m ON m.id = um.message_id
       WHERE um.created_at BETWEEN $1 AND $2`,
      [from, to],
    );

    const ourToolCostUsd = Number(rows[0].total_cost);
    const enterpriseCostUsd = seatCost * seats;

    res.json({
      periodFrom: from,
      periodTo: to,
      ourToolCostUsd,
      enterpriseSeatCostUsd: seatCost,
      enterpriseSeats: seats,
      enterpriseCostUsd,
      cheaperOption: enterpriseCostUsd === 0 ? null : ourToolCostUsd <= enterpriseCostUsd ? 'our_tool' : 'enterprise',
    });
  } catch (err) {
    next(err);
  }
});
