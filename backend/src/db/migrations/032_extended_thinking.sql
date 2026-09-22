-- Item 20 (docs/tasks/007-ui-ux-braki.md, section D): "extended thinking"
-- toggle, like Claude.ai's reasoning switch. `conversations.extended_thinking`
-- is a nullable-in-spirit boolean (NOT NULL DEFAULT false, same pattern as
-- `is_temporary` in migration 030) the user opts into per conversation; when
-- true, pipeline.js requests `thinking: { type: 'enabled', ... }` from the
-- Anthropic API instead of always stripping thinking blocks before persisting
-- history. `messages.thinking_content` stores that reasoning text (NULL for
-- every message from a non-extended-thinking turn, and for user messages),
-- so it can be rendered collapsed in the UI -- see chat.routes.js/page.tsx.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS extended_thinking BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS thinking_content TEXT;
