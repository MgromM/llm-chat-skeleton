ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS branched_from_conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branched_from_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_branched_from ON conversations(branched_from_conversation_id);
