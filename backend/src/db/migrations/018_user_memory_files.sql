-- Backs Anthropic's native `memory` tool: a virtual filesystem the model
-- reads/writes via view/create/str_replace/insert/delete/rename commands,
-- scoped per USER (not per conversation) so notes persist across chats —
-- e.g. "ten specjalista woli krótkie briefy" carries into every new thread
-- instead of being forgotten when a conversation ends.
CREATE TABLE IF NOT EXISTS user_memory_files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, path)
);
