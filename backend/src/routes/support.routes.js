import { Router } from 'express';
import { query } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notifySupportByEmail } from '../services/support/supportMailer.js';

export const supportRouter = Router();

const MAX_MESSAGE_LENGTH = 4000;

supportRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const { message, conversationId } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `message must be at most ${MAX_MESSAGE_LENGTH} characters` });
    }

    const emailSent = await notifySupportByEmail({
      message: message.trim(),
      fromEmail: req.user.email,
      conversationId: conversationId || null,
    });

    const { rows } = await query(
      `INSERT INTO support_messages (user_id, message, conversation_id, email_sent)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [req.user.sub, message.trim(), conversationId || null, emailSent],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});
