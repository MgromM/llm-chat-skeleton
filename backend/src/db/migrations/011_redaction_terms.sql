-- Literal client/brand names to redact before any text (specialist message
-- or tool output) reaches the model — closes the gap noted in
-- docs/AI_DATA_POLICY.md where only regex-shaped PII was tokenized.
CREATE TABLE IF NOT EXISTS redaction_terms (
  id SERIAL PRIMARY KEY,
  term TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'KLIENT',
  active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redaction_terms_active ON redaction_terms(active);
