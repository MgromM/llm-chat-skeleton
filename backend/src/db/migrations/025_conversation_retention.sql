-- Point 8 (compliance plan): conversations/messages currently have no
-- retention policy and grow forever. This migration only changes the FK on
-- leak_alerts.conversation_id from CASCADE to SET NULL, so that incident/
-- leak records (the compliance-relevant evidence) survive when the source
-- conversation is later cleaned up by the retention job -- the alert's own
-- `description`/`category`/`context` snapshot is what matters for audit,
-- not the live conversation row.
ALTER TABLE leak_alerts DROP CONSTRAINT IF EXISTS leak_alerts_conversation_id_fkey;
ALTER TABLE leak_alerts
  ADD CONSTRAINT leak_alerts_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
