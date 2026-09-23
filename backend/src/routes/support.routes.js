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

    const { rows } = await query(
      `INSERT INTO support_messages (user_id, message, conversation_id, email_sent)
       VALUES ($1, $2, $3, false)
       RETURNING id, created_at`,
      [req.user.sub, message.trim(), conversationId || null],
    );
    res.status(201).json(rows[0]);

    // Fire-and-forget: the message is already durably saved above, so a slow
    // or unreachable SMTP host (common on PaaS egress) must never make the
    // user wait on it or see a failure for something that already succeeded.
    notifySupportByEmail({
      message: message.trim(),
      fromEmail: req.user.email,
      conversationId: conversationId || null,
    })
      .then((emailSent) => {
        if (emailSent) return query('UPDATE support_messages SET email_sent = true WHERE id = $1', [rows[0].id]);
      })
      .catch(() => {});
  } catch (err) {
    next(err);
  }
});
