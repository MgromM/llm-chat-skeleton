import { Router } from 'express';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

export const reviewItemsRouter = Router();

const ITEM_TYPES = ['canteen_catalog', 'email_complaint'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Shared review queue (see migration 034) -- deliberately requireAuth only,
// no requireRole: unlike leak_alerts (managers/admins only), this is shared
// reference-data review that every logged-in employee should see, not a
// security/compliance tool.
reviewItemsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const conditions = [];
    const params = [];

    if (req.query.reviewed === 'false') {
      conditions.push('ri.reviewed = false');
    } else if (req.query.reviewed === 'true') {
      conditions.push('ri.reviewed = true');
    }

    if (req.query.item_type) {
      if (!ITEM_TYPES.includes(req.query.item_type)) {
        return res.status(400).json({ error: `item_type must be one of: ${ITEM_TYPES.join(', ')}` });
      }
      params.push(req.query.item_type);
      conditions.push(`ri.item_type = $${params.length}`);
    }

    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await query(`SELECT COUNT(*) FROM review_items ri ${where}`, params);

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT ri.id, ri.item_type, ri.title, ri.rationale, ri.source_label, ri.source_url,
              ri.source_ref, ri.confidence, ri.reviewed, ri.reviewed_at, ri.created_at,
              u.email AS reviewed_by_email
       FROM review_items ri
       LEFT JOIN users u ON u.id = ri.reviewed_by
       ${where}
       ORDER BY ri.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({ items: rows, total: Number(countRows[0].count) });
  } catch (err) {
    next(err);
  }
});

// Registered before POST /:id/review so a literal path segment never risks
// being swallowed by a param route (Express route-ordering gotcha).
reviewItemsRouter.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT COUNT(*) FROM review_items WHERE reviewed = false');
    res.json({ count: Number(rows[0].count) });
  } catch (err) {
    next(err);
  }
});

reviewItemsRouter.post('/:id/review', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE review_items SET reviewed = true, reviewed_by = $1, reviewed_at = now() WHERE id = $2 RETURNING id`,
      [req.user.sub, req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Review item not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
