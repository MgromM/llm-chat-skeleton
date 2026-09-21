-- Point 3 (compliance plan, pre-send guard): two extensions to sensitiveDataPrecheck.js.
-- 1) needs_review lets a low-confidence żółta/czerwona verdict be flagged for
--    manager review instead of hard-blocking the message (a confidence
--    threshold, so an uncertain call doesn't stop legitimate traffic).
-- 2) client_id/category NO_CONSENT records are covered by the existing
--    columns (conversation_id already lets a NO_CONSENT block be joined back
--    to conversations.client_id) — only needs_review is new.
ALTER TABLE precheck_results ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_precheck_results_needs_review ON precheck_results(needs_review);
