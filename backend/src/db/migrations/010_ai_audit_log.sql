-- Separate from usage_metrics/quality_scores (cost/debug logs): this table
-- records WHAT CATEGORIES of sensitive data were involved in a turn, never
-- the actual values, so "what left the company" can be answered without
-- keeping a second copy of sensitive data anywhere.
CREATE TABLE IF NOT EXISTS ai_audit_log (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_categories_sent TEXT[] NOT NULL DEFAULT '{}',
  redaction_applied BOOLEAN NOT NULL DEFAULT false,
  precheck_level TEXT,
  model TEXT NOT NULL,
  purpose TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_log_user_id ON ai_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_log_created_at ON ai_audit_log(created_at);
