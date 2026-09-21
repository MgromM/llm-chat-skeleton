import { Router } from 'express';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { attachUserDbContext } from '../middleware/dbContext.js';

// Item 14 (docs/tasks/007-ui-ux-braki.md, section D): "Projects" like
// Claude.ai -- groups conversations around a shared name/description and an
// optional project-level system prompt (instructions). Scoped to the
// authenticated user, same pattern as chat.routes.js's `/conversations`
// (RLS via attachUserDbContext + migration 028's projects_isolation policy).
export const projectsRouter = Router();

projectsRouter.use(requireAuth, attachUserDbContext);

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

projectsRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, description, system_prompt, created_at, updated_at
       FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.sub],
    );
    res.json(rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const description = req.body.description ? String(req.body.description).trim() || null : null;
    const systemPrompt = req.body.systemPrompt ? String(req.body.systemPrompt).trim() || null : null;

    const { rows } = await query(
      `INSERT INTO projects (user_id, name, description, system_prompt)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, system_prompt, created_at, updated_at`,
      [req.user.sub, name, description, systemPrompt],
    );
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, description, system_prompt, created_at, updated_at
       FROM projects WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.sub],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

projectsRouter.patch('/:id', async (req, res, next) => {
  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'name must not be empty' });
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (req.body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(req.body.description === null ? null : String(req.body.description).trim() || null);
    }
    if (req.body.systemPrompt !== undefined) {
      updates.push(`system_prompt = $${paramIndex++}`);
      values.push(req.body.systemPrompt === null ? null : String(req.body.systemPrompt).trim() || null);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'nothing to update' });
    updates.push('updated_at = now()');

    values.push(req.params.id, req.user.sub);
    const { rows } = await query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING id, name, description, system_prompt, created_at, updated_at`,
      values,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

projectsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.sub,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
