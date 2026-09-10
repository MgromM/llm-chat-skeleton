CREATE TABLE IF NOT EXISTS precheck_results (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  blocked BOOLEAN NOT NULL,
  category TEXT,
  confidence NUMERIC(3, 2),
  rationale TEXT,
  judge_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_precheck_results_conversation_id ON precheck_results(conversation_id);
CREATE INDEX IF NOT EXISTS idx_precheck_results_created_at ON precheck_results(created_at);
