import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { attachUserDbContext } from '../middleware/dbContext.js';
import { query, runWithDbContext } from '../config/db.js';

/**
 * Whole-conversation public sharing (Claude.ai's "Share chat" link),
 * mirroring the artifact-sharing pattern in artifacts.routes.js: an opaque,
 * unguessable `share_token` on the conversation row, set only when the
 * owner explicitly shares, cleared to revoke. A separate router (rather
 * than folded into chat.routes.js) so it can be mounted independently and
 * keep its own auth boundary.
 */
export const sharingRouter = Router();

sharingRouter.post('/chat/conversations/:id/share', requireAuth, attachUserDbContext, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT id, share_token FROM conversations WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user.sub,
    ]);
    const conversation = rows[0];
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const shareToken = conversation.share_token ?? crypto.randomBytes(24).toString('base64url');
    if (!conversation.share_token) {
      await query(`UPDATE conversations SET share_token = $2 WHERE id = $1`, [conversation.id, shareToken]);
    }
    res.json({ shareToken });
  } catch (err) {
    next(err);
  }
});

sharingRouter.delete('/chat/conversations/:id/share', requireAuth, attachUserDbContext, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT id FROM conversations WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user.sub,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Conversation not found' });
    await query(`UPDATE conversations SET share_token = NULL WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Public, unauthenticated: read-only lookup by share token. Runs with an
// admin-scoped RLS context (no user id) so the FORCE ROW LEVEL SECURITY
// policy on conversations/messages doesn't hide the row — the token itself
// (not the requester's identity) is what authorizes access, same trust
// model as the artifact share link.
sharingRouter.get('/public/conversations/:token', (req, res, next) => {
  runWithDbContext({ userId: null, isAdmin: true }, async () => {
    try {
      const { rows: convRows } = await query(`SELECT id, title, created_at FROM conversations WHERE share_token = $1`, [
        req.params.token,
      ]);
      const conversation = convRows[0];
      if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

      const { rows: messages } = await query(
        `SELECT id, role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY id ASC`,
        [conversation.id],
      );
      res.json({
        title: conversation.title,
        createdAt: conversation.created_at,
        messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })),
      });
    } catch (err) {
      next(err);
    }
  });
});
