import { query } from '../../config/db.js';

const CACHE_TTL_MS = 30_000;
let cache = null;
let cachedAt = 0;

/**
 * Active client/brand terms to redact, cached briefly in-process so every
 * chat turn doesn't hit the DB just to build the redaction session — a new
 * term added via the admin endpoint below takes up to CACHE_TTL_MS to apply.
 */
export async function getRedactionTerms() {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  const { rows } = await query('SELECT term, category FROM redaction_terms WHERE active = true');
  cache = rows;
  cachedAt = Date.now();
  return cache;
}

function invalidateCache() {
  cache = null;
}

export async function listRedactionTerms() {
  const { rows } = await query(
    'SELECT id, term, category, active, created_at FROM redaction_terms ORDER BY created_at DESC',
  );
  return rows;
}

export async function addRedactionTerm({ term, category, createdBy }) {
  const { rows } = await query(
    'INSERT INTO redaction_terms (term, category, created_by) VALUES ($1, $2, $3) RETURNING id, term, category, active, created_at',
    [term, category || 'KLIENT', createdBy ?? null],
  );
  invalidateCache();
  return rows[0];
}

export async function deactivateRedactionTerm(id) {
  await query('UPDATE redaction_terms SET active = false WHERE id = $1', [id]);
  invalidateCache();
}
