-- Persists the PII/client-name token map (and per-category counters) for a
-- conversation, instead of restarting numbering fresh on every turn — see
-- the bug where `[KLIENT_1]` in turn 1 and `[KLIENT_1]` in turn 3 could
-- silently refer to two different real values once turn 1's tokenized text
-- is replayed as history alongside turn 3's freshly tokenized message.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS redaction_state JSONB NOT NULL DEFAULT '{}'::jsonb;
