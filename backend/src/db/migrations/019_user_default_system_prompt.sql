-- Per-user default system prompt (role/context), applied to every conversation
-- of that user. A conversation's own system_prompt (007) is appended after it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_system_prompt TEXT;
