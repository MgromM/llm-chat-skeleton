-- Admin-configured remote MCP servers (Anthropic's native MCP connector —
-- the model calls these directly over HTTP, server-side, the same way it
-- calls web_search). `auth_token` is a bearer token for the remote server,
-- not an Anthropic credential; it is never returned by the list endpoint.
CREATE TABLE IF NOT EXISTS mcp_connectors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  auth_token TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_connectors_enabled ON mcp_connectors(enabled);
