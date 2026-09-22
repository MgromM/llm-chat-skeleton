import { BigQuery } from '@google-cloud/bigquery';

let bigquery;

function getBigQuery() {
  if (!bigquery) bigquery = new BigQuery({ projectId: process.env.GCP_PROJECT_ID || undefined });
  return bigquery;
}

// Comma-separated `dataset.table` allowlist, e.g. "analytics.campaign_summary,analytics.sales_agg".
// Empty = no table is allowed (fail closed) until this is explicitly configured — the MVP has no
// BigQuery access yet (see docs/plan-mvp.md), so this stays empty in every env by default.
function getAllowedTables() {
  return (process.env.BIGQUERY_ALLOWED_TABLES ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

// Whether the tool has anything it could actually query. With an empty
// allowlist every query is rejected before it reaches BigQuery — exposing
// the tool to the model anyway just makes it retry different queries until
// it burns through the tool-use round limit, which reads as the chat
// "getting stuck" on a request that can never succeed.
export function isBigQueryConfigured() {
  return getAllowedTables().length > 0;
}

// Extracts `dataset.table` (optionally `project.dataset.table`, optionally backtick-quoted)
// references following FROM/JOIN, so we can check each one against the allowlist.
function extractReferencedTables(sql) {
  const pattern = /\b(?:FROM|JOIN)\s+`?([a-zA-Z0-9_-]+\.)?([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)`?/gi;
  const tables = [];
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    tables.push(`${match[2]}.${match[3]}`.toLowerCase());
  }
  return tables;
}

// Exposed to Claude as a tool. Kept as a single read-only query tool for the
// MVP — no write access, no arbitrary DDL, and restricted to an explicit
// dataset.table allowlist so the model can never reach tables/columns that
// haven't been reviewed for sensitive data.
export const bigQueryTool = {
  name: 'query_bigquery',
  description:
    'Uruchamia zapytanie SQL (tylko SELECT) na firmowym BigQuery i zwraca wynik jako JSON. Używaj do pytań o dane kampanii/sprzedaży.',
  input_schema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'Zapytanie SQL, wyłącznie SELECT.' },
    },
    required: ['sql'],
  },
};

// Lightweight connectivity/config check for an admin diagnostic endpoint —
// does not run any user/model-supplied SQL, just confirms the client can
// authenticate and reach the configured project.
export async function checkBigQueryConnection() {
  const allowed = getAllowedTables();
  if (!process.env.GCP_PROJECT_ID) {
    return { connected: false, error: 'GCP_PROJECT_ID not set', allowedTables: allowed };
  }
  try {
    await getBigQuery().query({ query: 'SELECT 1', useLegacySql: false });
    return { connected: true, projectId: process.env.GCP_PROJECT_ID, allowedTables: allowed };
  } catch (err) {
    return { connected: false, error: err.message, projectId: process.env.GCP_PROJECT_ID, allowedTables: allowed };
  }
}

export async function runBigQueryTool({ sql }, signal) {
  if (!/^\s*select/i.test(sql)) {
    throw new Error('Only SELECT queries are allowed');
  }

  const allowed = getAllowedTables();
  const referenced = extractReferencedTables(sql);

  if (referenced.length === 0) {
    throw new Error('Query must reference at least one table via FROM/JOIN');
  }
  const disallowed = referenced.filter((t) => !allowed.includes(t));
  if (disallowed.length > 0) {
    throw new Error(
      `Access to table(s) not permitted: ${disallowed.join(', ')}. Allowed: ${allowed.join(', ') || '(none configured)'}`,
    );
  }

  if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });

  const [job] = await getBigQuery().createQueryJob({ query: sql, useLegacySql: false, maxResults: 200 });
  if (!signal) {
    const [rows] = await job.getQueryResults();
    return rows;
  }

  // The BigQuery client has no built-in AbortSignal support — race the query
  // against the abort so an SSE disconnect (tab closed, user hit stop) stops
  // waiting on it immediately, and cancel the job itself instead of leaving
  // it to burn compute in the background for a response nobody reads anymore.
  let onAbort;
  const abortPromise = new Promise((_, reject) => {
    onAbort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    signal.addEventListener('abort', onAbort);
  });
  try {
    const [rows] = await Promise.race([job.getQueryResults(), abortPromise]);
    return rows;
  } catch (err) {
    if (signal.aborted) job.cancel().catch(() => {});
    throw err;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
