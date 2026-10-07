import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { getSecret } from '../config/secrets.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { attachUserDbContext } from '../middleware/dbContext.js';
import { deleteAttachmentFile } from '../services/attachments/attachmentStore.js';
import {
  GoogleOAuthError,
  googleExchangeCode,
  googleGetLoginUrl,
  googleValidateIdToken,
} from '../config/googleOAuth.js';

export const authRouter = Router();

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, email, role, default_system_prompt FROM users WHERE id = $1', [req.user.sub]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ ...rows[0], defaultSystemPrompt: rows[0].default_system_prompt });
  } catch (err) {
    next(err);
  }
});

// GDPR "right to erasure": deletes the account and every row that belongs to
// it. ON DELETE CASCADE (users -> conversations -> messages -> attachments/
// usage_metrics/quality_scores, and leak_alerts) handles the DB rows; the
// attachment files on disk/GCS aren't covered by that, so they're removed
// explicitly first. Knowledge base documents the user uploaded are kept
// (shared company resource) with their uploaded_by reference nulled out.
authRouter.delete('/me', requireAuth, attachUserDbContext, async (req, res, next) => {
  try {
    const { rows: attachments } = await query(
      `SELECT a.storage_path FROM message_attachments a
       JOIN messages m ON m.id = a.message_id
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1`,
      [req.user.sub],
    );
    await Promise.all(attachments.map((a) => deleteAttachmentFile(a.storage_path)));

    const { rowCount } = await query('DELETE FROM users WHERE id = $1', [req.user.sub]);
    if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Fully-open demo mode: mints a token for one fixed shared account so
// people can use the app with zero setup, no Google OAuth client needed.
// Opt-in only via DISABLE_AUTH=true — every visitor becomes the same
// 'admin' user, so only turn this on for a trusted-link demo, never for a
// deployment that should actually separate who-did-what.
if (process.env.DISABLE_AUTH === 'true') {
  authRouter.get('/demo-login', async (req, res, next) => {
    try {
      const email = 'demo@wyslijrakiete.pl';
      const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      const { rows } = await query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (email) DO UPDATE SET role = 'admin'
         RETURNING id, email, role`,
        [email, randomPasswordHash],
      );
      const user = rows[0];

      const secret = await getSecret('JWT_SECRET');
      const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret, { expiresIn: '12h' });
      const frontendUrl = await getSecret('FRONTEND_URL');
      res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch (err) {
      next(err);
    }
  });
}

authRouter.get('/google/login-url', async (req, res, next) => {
  try {
    const frontendUrl = await getSecret('FRONTEND_URL');
    const url = await googleGetLoginUrl(frontendUrl);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// Google OAuth callback: an account self-provisions on first login (as
// 'specialist' — /register stays the way to grant 'admin'). If
// ALLOWED_EMAIL_DOMAIN is set, it acts as the access gate and only that
// domain may self-provision; if unset, any Google account is allowed.
authRouter.get('/google/callback', async (req, res, next) => {
  const frontendUrl = await getSecret('FRONTEND_URL');
  try {
    const { code, error } = req.query;
    if (error || !code) {
      return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(error || 'missing_code')}`);
    }

    const credentials = await googleExchangeCode(code);
    const payload = await googleValidateIdToken(credentials.id_token);

    const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();
    const emailDomainOk =
      !allowedDomain || (payload.email && payload.email.toLowerCase().endsWith(`@${allowedDomain}`));
    if (!payload.email || !emailDomainOk) {
      return res.redirect(`${frontendUrl}/auth/callback?error=no_access`);
    }

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [payload.email]);
    let user = rows[0];
    if (!user) {
      // Password login stays unusable for a self-provisioned account (no one
      // is ever told this hash) — it exists only to satisfy the NOT NULL
      // column, since these users only ever authenticate via Google.
      const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      const inserted = await query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
        [payload.email, randomPasswordHash, 'specialist'],
      );
      user = inserted.rows[0];
    }

    const secret = await getSecret('JWT_SECRET');
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: '12h' },
    );
    res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (err) {
    if (err instanceof GoogleOAuthError) {
      return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(err.message)}`);
    }
    next(err);
  }
});

// Only sign-in path in the app is Google OAuth (/google/login-url +
// /google/callback below) — accounts self-provision on first Google login,
// so there's no password login/registration to replace. Admin still needs a
// way to see who's provisioned and promote one to 'admin'.
authRouter.get('/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, email, role FROM users ORDER BY email ASC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

authRouter.patch('/users/:id/role', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['specialist', 'admin'].includes(role)) {
      return res.status(400).json({ error: "role must be 'specialist' or 'admin'" });
    }
    const { rows } = await query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role', [role, req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Lets a specialist configure how many recent messages the uncertain-leak
// agent attaches as context when it flags one of their conversations.
authRouter.patch('/me/settings', requireAuth, async (req, res, next) => {
  try {
    const { leakContextMessages } = req.body;
    if (leakContextMessages === undefined) {
      return res.status(400).json({ error: 'leakContextMessages required' });
    }
    const value = leakContextMessages === null ? null : Number(leakContextMessages);
    if (value !== null && (!Number.isInteger(value) || value < 1)) {
      return res.status(400).json({ error: 'leakContextMessages must be a positive integer or null' });
    }

    await query('UPDATE users SET leak_context_messages = $1 WHERE id = $2', [value, req.user.sub]);
    res.json({ leakContextMessages: value });
  } catch (err) {
    next(err);
  }
});

// Lets a specialist set their own default system prompt (role/context),
// automatically applied to every one of their conversations.
authRouter.patch('/me/default-system-prompt', requireAuth, async (req, res, next) => {
  try {
    const { defaultSystemPrompt } = req.body;
    if (defaultSystemPrompt === undefined) {
      return res.status(400).json({ error: 'defaultSystemPrompt required' });
    }
    const value = defaultSystemPrompt === null ? null : String(defaultSystemPrompt).trim() || null;

    await query('UPDATE users SET default_system_prompt = $1 WHERE id = $2', [value, req.user.sub]);
    res.json({ defaultSystemPrompt: value });
  } catch (err) {
    next(err);
  }
});
