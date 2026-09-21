-- Point 9 (compliance plan): link conversations to a client, and track
-- which specialists/teams are assigned to work with which client — so
-- compliance can audit access against assignment.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations(client_id);

CREATE TABLE IF NOT EXISTS client_team_assignments (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_client_team_assignments_client_id ON client_team_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_team_assignments_user_id ON client_team_assignments(user_id);
