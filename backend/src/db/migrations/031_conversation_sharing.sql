-- Public read-only sharing of a whole conversation (like Claude.ai's
-- "Share chat" link), analogous to the existing artifact sharing in
-- artifacts.routes.js. share_token is only ever set when the owner
-- explicitly shares; NULL means not shared, and a share can be revoked by
-- clearing it back to NULL.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_conversations_share_token ON conversations(share_token);
