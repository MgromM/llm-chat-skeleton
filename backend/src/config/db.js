import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool } = pg;

// Point 6 (compliance plan): the app connects as `app_role`, a
// restricted role with RLS enforced on `conversations`/`messages` (see
// migration 026) -- a second line of defense against a missing `WHERE
// user_id = ...` in app code. Falls back to DATABASE_URL when
// APP_DATABASE_URL isn't set, so environments that haven't provisioned the
// restricted role yet (or the migration runner itself, which needs owner
// privileges to create the role/policies) keep working unchanged.
export const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Per-request RLS context: which user is making this query, and whether
// they're allowed to see across users (admin/manager routes: audits, cost
// reports, etc). This holds a plain {userId, isAdmin} value, never a live
// connection -- safe to outlive the request it was captured in (e.g. a
// fire-and-forget agent call that resolves after the response is sent),
// since every query does its own fresh checkout/set/release.
const dbContext = new AsyncLocalStorage();

export function runWithDbContext(context, fn) {
  return dbContext.run(context, fn);
}

export async function query(text, params) {
  const ctx = dbContext.getStore();
  if (!ctx) return pool.query(text, params);

  const client = await pool.connect();
  try {
    await client.query('SELECT set_config($1, $2, false), set_config($3, $4, false)', [
      'app.current_user_id',
      ctx.userId != null ? String(ctx.userId) : '',
      'app.is_admin',
      ctx.isAdmin ? 'true' : 'false',
    ]);
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
