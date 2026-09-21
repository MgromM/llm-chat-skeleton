import { Router } from 'express';
import { query } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { checkClientCompliance } from '../services/compliance/complianceAgent.js';

export const clientsRouter = Router();

clientsRouter.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.name, c.ai_consent, c.ai_consent_updated_at, u.email AS ai_consent_updated_by
       FROM clients c
       LEFT JOIN users u ON u.id = c.ai_consent_updated_by
       ORDER BY c.name ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const { rows } = await query(
      'INSERT INTO clients (name) VALUES ($1) RETURNING id, name, ai_consent, ai_consent_updated_at',
      [name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

clientsRouter.get('/:id/consent-history', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT h.id, h.old_value, h.new_value, h.changed_at, u.email AS changed_by
       FROM client_consent_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.client_id = $1
       ORDER BY h.changed_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch('/:id/consent', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { aiConsent } = req.body;
    if (typeof aiConsent !== 'boolean') {
      return res.status(400).json({ error: 'aiConsent must be a boolean' });
    }

    const { rows: existingRows } = await query('SELECT ai_consent FROM clients WHERE id = $1', [req.params.id]);
    if (existingRows.length === 0) return res.status(404).json({ error: 'Client not found' });
    const oldValue = existingRows[0].ai_consent;

    const { rows } = await query(
      `UPDATE clients
       SET ai_consent = $1, ai_consent_updated_at = now(), ai_consent_updated_by = $2
       WHERE id = $3
       RETURNING id, name, ai_consent, ai_consent_updated_at`,
      [aiConsent, req.user.sub, req.params.id]
    );

    await query(
      'INSERT INTO client_consent_history (client_id, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4)',
      [req.params.id, oldValue, aiConsent, req.user.sub]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Point 9 (compliance plan): which specialists are assigned to which client.
clientsRouter.get('/:id/team', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.user_id, u.email, a.assigned_at, assigner.email AS assigned_by
       FROM client_team_assignments a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN users assigner ON assigner.id = a.assigned_by
       WHERE a.client_id = $1
       ORDER BY a.assigned_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/:id/team', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'userId must be an integer' });
    }
    const { rows } = await query(
      `INSERT INTO client_team_assignments (client_id, user_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (client_id, user_id) DO NOTHING
       RETURNING id, client_id, user_id, assigned_at`,
      [req.params.id, userId, req.user.sub]
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: 'User already assigned to this client' });
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

clientsRouter.delete('/:id/team/:userId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM client_team_assignments WHERE client_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Point 9: audit signal — specialists who touched a client's conversations
// without being assigned to that client.
clientsRouter.get('/access-audit', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT c.client_id, cl.name AS client_name, c.user_id, u.email AS user_email
       FROM conversations c
       JOIN clients cl ON cl.id = c.client_id
       JOIN users u ON u.id = c.user_id
       WHERE c.client_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM client_team_assignments a
           WHERE a.client_id = c.client_id AND a.user_id = c.user_id
         )
       ORDER BY cl.name ASC, u.email ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Point 7 (compliance plan): rule+Haiku compliance agent, exposed standalone
// for now so it can be tested from the compliance panel before it's wired
// into the pre-send guard (point 3, not yet decided).
clientsRouter.post('/:id/compliance-check', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' });
    }
    const result = await checkClientCompliance({ clientId: Number(req.params.id), text });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
