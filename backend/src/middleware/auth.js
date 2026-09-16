import jwt from 'jsonwebtoken';
import { getSecret } from '../config/secrets.js';

async function verifyToken(token, req, res, next) {
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    const secret = await getSecret('JWT_SECRET');
    const payload = jwt.verify(token, secret);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      console.warn('Auth: token expired', { expiredAt: err.expiredAt });
    } else {
      console.warn('Auth: token invalid', { name: err.name, message: err.message });
    }
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  return verifyToken(token, req, res, next);
}

/**
 * Like `requireAuth`, but also accepts the JWT as a `?token=` query param —
 * needed only for the attachment-download route, since `<img>`/`<a>` tags
 * can't set an Authorization header. Do NOT use this on other routes: a
 * query-string token leaks into server/proxy access logs and Referer headers.
 */
export async function requireAuthViaHeaderOrQuery(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : req.query.token;
  return verifyToken(token, req, res, next);
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
