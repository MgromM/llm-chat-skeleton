-- Item 17 (docs/tasks/007-ui-ux-braki.md, section D): temporary/incognito
-- conversations, like Claude.ai's "temporary chat" -- hidden from the
-- default conversation list. NOT fully ephemeral/unpersisted: migrations
-- 025 (retention) and 026 (RLS isolation) plus the leak-detection precheck
-- flow (sensitiveDataPrecheck.js / classifyDraftMessage in pipeline.js,
-- writing to leak_alerts / ai_audit_log) establish a mandatory audit trail
-- for every conversation regardless of visibility. A temporary conversation
-- still gets a row in `conversations`, its messages still go through the
-- same classify/precheck/audit-log pipeline as any other conversation, and
-- it is still subject to the same DATA_RETENTION_DAYS cleanup job -- only
-- its default visibility in `GET /chat/conversations` changes.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT false;
