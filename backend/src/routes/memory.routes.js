import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listUserMemoryFiles, deleteUserMemoryFile, clearUserMemory } from '../services/mcp/memoryTool.js';

// A specialist's own view into what Claude's `memory` tool has saved about
// them (see backend/src/services/mcp/memoryTool.js) — every route here is
// scoped to `req.user.sub`, never another user's memory.
export const memoryRouter = Router();
memoryRouter.use(requireAuth);

memoryRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listUserMemoryFiles(req.user.sub));
  } catch (err) {
    next(err);
  }
});

memoryRouter.delete('/', async (req, res, next) => {
  try {
    await clearUserMemory(req.user.sub);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

memoryRouter.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await deleteUserMemoryFile(req.user.sub, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Memory file not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
