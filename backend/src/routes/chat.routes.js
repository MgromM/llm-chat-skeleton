import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { handleChatTurn } from '../services/chatCore/pipeline.js';

export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.post('/conversations', async (req, res, next) => {
  try {
    const { rows } = await query(
      'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at',
      [req.user.sub, req.body.title ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/conversations', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, title, created_at FROM conversations WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.sub],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT m.id, m.role, m.content, m.created_at
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = $1 AND c.user_id = $2
       ORDER BY m.created_at ASC`,
      [req.params.id, req.user.sub],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    const { rows } = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.sub,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const result = await handleChatTurn({ conversationId: req.params.id, userId: req.user.sub, userMessage: message });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
