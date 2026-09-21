import { runWithDbContext } from '../config/db.js';

/**
 * Attaches the RLS context (point 6, compliance plan) for the rest of this
 * request: which user is asking, and whether their role lets them see
 * across users. Mount after `requireAuth`/`requireRole` so `req.user` is
 * populated. `isAdmin` routes (manager/admin-gated routers) legitimately
 * query conversations/messages across users -- everyone else is scoped to
 * their own rows by the `conversations_isolation`/`messages_isolation`
 * policies.
 */
export function attachUserDbContext(req, res, next) {
  runWithDbContext({ userId: req.user?.sub ?? null, isAdmin: false }, next);
}

export function attachAdminDbContext(req, res, next) {
  runWithDbContext({ userId: req.user?.sub ?? null, isAdmin: true }, next);
}
