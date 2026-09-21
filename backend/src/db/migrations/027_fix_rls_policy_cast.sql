-- Fixes a bug in 026: when there's no user in context (background jobs,
-- admin routes with userId=null), db.js sets app.current_user_id to '' --
-- casting '' straight to integer throws even when app.is_admin='true'
-- should already grant access via the OR. NULLIF converts '' to NULL first,
-- so the cast never runs on an invalid value.
DROP POLICY IF EXISTS conversations_isolation ON conversations;
CREATE POLICY conversations_isolation ON conversations
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
  );

DROP POLICY IF EXISTS messages_isolation ON messages;
CREATE POLICY messages_isolation ON messages
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR conversation_id IN (
      SELECT id FROM conversations WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR conversation_id IN (
      SELECT id FROM conversations WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );
