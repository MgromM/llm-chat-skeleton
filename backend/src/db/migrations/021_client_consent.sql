-- Compliance panel: per-client AI-processing consent flag, editable by an
-- admin, with an append-only audit trail of who changed it and when.
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ai_consent BOOLEAN NOT NULL DEFAULT false,
  ai_consent_updated_at TIMESTAMPTZ,
  ai_consent_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_consent_history (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  old_value BOOLEAN,
  new_value BOOLEAN NOT NULL,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_consent_history_client_id ON client_consent_history(client_id);
