import { query } from '../../config/db.js';

// Anthropic's native MCP connector: given a remote MCP server's URL, Claude
// calls its tools directly over HTTP, server-side — same execution model as
// web_search/code_execution. Still in beta.
export const MCP_CLIENT_BETA = 'mcp-client-2025-04-04';

const CACHE_TTL_MS = 30_000;
let cache = null;
let cachedAt = 0;

function invalidateCache() {
  cache = null;
}

/**
 * Active connectors shaped for the `mcp_servers` request param, cached
 * briefly in-process (same pattern as `getRedactionTerms`) so every chat
 * turn doesn't hit the DB just to build the tool-call request — an admin
 * change here takes up to CACHE_TTL_MS to apply.
 */
export async function getEnabledMcpServers() {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  const { rows } = await query('SELECT name, url, auth_token FROM mcp_connectors WHERE enabled = true');
  cache = rows.map((r) => ({
    type: 'url',
    name: r.name,
    url: r.url,
    ...(r.auth_token ? { authorization_token: r.auth_token } : {}),
  }));
  cachedAt = Date.now();
  return cache;
}

/** Admin listing — never returns the raw token, only whether one is set. */
export async function listMcpConnectors() {
  const { rows } = await query(
    'SELECT id, name, url, enabled, (auth_token IS NOT NULL) AS has_token, created_at FROM mcp_connectors ORDER BY created_at DESC',
  );
  return rows;
}

export async function addMcpConnector({ name, url, authToken, createdBy }) {
  const { rows } = await query(
    `INSERT INTO mcp_connectors (name, url, auth_token, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, url, enabled, (auth_token IS NOT NULL) AS has_token, created_at`,
    [name, url, authToken || null, createdBy ?? null],
  );
  invalidateCache();
  return rows[0];
}

export async function setMcpConnectorEnabled(id, enabled) {
  await query('UPDATE mcp_connectors SET enabled = $2 WHERE id = $1', [id, enabled]);
  invalidateCache();
}

export async function deleteMcpConnector(id) {
  await query('DELETE FROM mcp_connectors WHERE id = $1', [id]);
  invalidateCache();
}
