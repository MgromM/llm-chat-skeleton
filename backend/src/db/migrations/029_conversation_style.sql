-- Item 15 (docs/tasks/007-ui-ux-braki.md, section D): response style
-- presets (zwięzły/formalny/kreatywny/domyślny), like Claude.ai's response
-- styles -- a nullable per-conversation tone modifier, additional to the
-- existing global -> project -> conversation system-prompt hierarchy from
-- item 14. NULL/"default" means no extra instruction.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS style TEXT;
