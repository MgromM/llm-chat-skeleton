ALTER TABLE users ADD COLUMN IF NOT EXISTS leak_context_messages INTEGER;

CREATE TABLE IF NOT EXISTS leak_alerts (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT,
  confidence NUMERIC(3, 2),
  rationale TEXT,
  context JSONB NOT NULL,
  judge_model TEXT NOT NULL,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leak_alerts_conversation_id ON leak_alerts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leak_alerts_created_at ON leak_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_leak_alerts_reviewed ON leak_alerts(reviewed);
