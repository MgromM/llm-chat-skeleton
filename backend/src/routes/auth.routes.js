import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { getSecret } from '../config/secrets.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  GoogleOAuthError,
  googleExchangeCode,
  googleGetLoginUrl,
  googleValidateIdToken,
} from '../config/googleOAuth.js';

export const authRouter = Router();

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, email, role FROM users WHERE id = $1', [req.user.sub]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

authRouter.get('/google/login-url', async (req, res, next) => {
  try {
    const frontendUrl = await getSecret('FRONTEND_URL');
    const url = await googleGetLoginUrl(frontendUrl);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// Google OAuth callback: only lets already-provisioned users in (no
// self-signup), mirroring the admin-only /register flow above.
authRouter.get('/google/callback', async (req, res, next) => {
  const frontendUrl = await getSecret('FRONTEND_URL');
  try {
    const { code, error } = req.query;
    if (error || !code) {
      return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(error || 'missing_code')}`);
    }

    const credentials = await googleExchangeCode(code);
    const payload = await googleValidateIdToken(credentials.id_token);

    if (!payload.email || !payload.email.toLowerCase().endsWith('@salesmore.pl')) {
      return res.redirect(`${frontendUrl}/auth/callback?error=no_access`);
    }

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [payload.email]);
    const user = rows[0];
    if (!user) {
      return res.redirect(`${frontendUrl}/auth/callback?error=no_access`);
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

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const secret = await getSecret('JWT_SECRET');
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: '12h' },
    );
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

// Admin-only: create a new specialist/manager account. No self-signup in the MVP.
authRouter.post('/register', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { email, password, role = 'specialist' } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, passwordHash, role],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
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
