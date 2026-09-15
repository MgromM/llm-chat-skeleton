-- Per-conversation model choice and optional system prompt. NULL falls back
-- to the CHAT_MODEL env default / no extra system prompt.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS system_prompt TEXT;
