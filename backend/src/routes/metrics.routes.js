import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { attachAdminDbContext } from '../middleware/dbContext.js';
import { getCostSummary, getCostByUser } from '../services/metrics/usageTracker.js';
import { query } from '../config/db.js';
import { checkBigQueryConnection } from '../services/mcp/bigqueryServer.js';
import { listRedactionTerms, addRedactionTerm, deactivateRedactionTerm } from '../services/security/redactionTerms.js';
import { findExpiredConversationIds, runRetentionCleanup } from '../services/retention/retentionCleanup.js';

export const metricsRouter = Router();
metricsRouter.use(requireAuth, requireRole('manager', 'admin'), attachAdminDbContext);

// Diagnostic for admins to confirm the BigQuery service account/dataset is
// wired up correctly, without needing to go through the chat/LLM path.
metricsRouter.get('/bigquery-status', async (req, res, next) => {
  try {
    res.json(await checkBigQueryConnection());
  } catch (err) {
    next(err);
  }
});

// Point 8 (compliance plan): no auto-expiry existed for conversations.
// `count` previews how many conversations are past the retention window
// (DATA_RETENTION_DAYS); `run` deletes them (only if DATA_RETENTION_ENABLED
// allows it, otherwise it's a dry run) -- for on-demand cleanup or checking
// the scheduled job's next batch before it fires.
metricsRouter.get('/retention', async (req, res, next) => {
  try {
    const ids = await findExpiredConversationIds();
    res.json({ expiredConversationCount: ids.length });
  } catch (err) {
    next(err);
  }
});

metricsRouter.post('/retention/run', async (req, res, next) => {
  try {
    res.json(await runRetentionCleanup({ dryRun: req.body?.dryRun !== false }));
  } catch (err) {
    next(err);
  }
});

// ai_audit_log is write-only today (logAiAudit() records which PII
// categories were involved in a turn, never the actual values) -- this is
// the read side, so "what left the company, and to which model" can
// actually be answered by an admin instead of only living in the DB.
metricsRouter.get('/ai-audit-log', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const { from, to } = parseRange(req);

    const conditions = ['a.created_at BETWEEN $1 AND $2'];
    const params = [from, to];
    if (userId) {
      params.push(userId);
      conditions.push(`a.user_id = $${params.length}`);
    }
    params.push(limit, offset);

    const { rows } = await query(
      `SELECT a.id, a.conversation_id, a.user_id, u.email, a.data_categories_sent,
              a.redaction_applied, a.precheck_level, a.model, a.purpose, a.created_at
       FROM ai_audit_log a
       JOIN users u ON u.id = a.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

metricsRouter.get('/leak-alerts', async (req, res, next) => {
  try {
    const onlyUnreviewed = req.query.reviewed === 'false';
    const { rows } = await query(
      `SELECT la.id, la.conversation_id, la.user_id, u.email, la.category, la.confidence,
              la.rationale, la.context, la.judge_model, la.reviewed, la.created_at,
              la.source, la.severity, la.description, la.screenshot_path IS NOT NULL AS has_screenshot
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

// Client/brand names to redact from every chat turn (message + tool
// results) before it reaches the model — see docs/AI_DATA_POLICY.md.
metricsRouter.get('/redaction-terms', async (req, res, next) => {
  try {
    res.json(await listRedactionTerms());
  } catch (err) {
    next(err);
  }
});

metricsRouter.post('/redaction-terms', async (req, res, next) => {
  try {
    const term = String(req.body.term ?? '').trim();
    if (!term) return res.status(400).json({ error: 'term is required' });
    const category = req.body.category ? String(req.body.category).trim() : undefined;
    const created = await addRedactionTerm({ term, category, createdBy: req.user.sub });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

metricsRouter.delete('/redaction-terms/:id', async (req, res, next) => {
  try {
    await deactivateRedactionTerm(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Remote MCP connectors (Anthropic's native, server-side MCP client) and
// the quality-judge endpoint below were removed along with those features —
// neither has an Ollama equivalent.

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

metricsRouter.get('/costs-by-user', async (req, res, next) => {
  try {
    res.json(await getCostByUser(parseRange(req)));
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
