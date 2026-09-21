-- Manual incident reporting ("błędy są ludzkie"), sharing the review queue
-- with the automated uncertain-leak detector (003) instead of a parallel
-- table: `source` tells the two apart, the rest of the schema is common.
ALTER TABLE leak_alerts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual'));
ALTER TABLE leak_alerts ADD COLUMN IF NOT EXISTS severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE leak_alerts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE leak_alerts ADD COLUMN IF NOT EXISTS screenshot_path TEXT;
ALTER TABLE leak_alerts ADD COLUMN IF NOT EXISTS reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Manual reports aren't always tied to a conversation, and don't go through
-- the judge model at all.
ALTER TABLE leak_alerts ALTER COLUMN conversation_id DROP NOT NULL;
ALTER TABLE leak_alerts ALTER COLUMN judge_model DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leak_alerts_source ON leak_alerts(source);
