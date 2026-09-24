-- Point 6 (compliance plan): "chinese wall" between users/clients for chat
-- data. App-level `WHERE user_id = $x` filtering already exists everywhere,
-- but a missing filter in a future query would silently leak one user's
-- conversations to another. This adds a second line of defense at the
-- Postgres level: a restricted role the app runs as day-to-day, which can
-- only see its own rows in `conversations`/`messages` unless the request
-- context marks it as admin/manager (audits, cost reports, etc. legitimately
-- cross users).
--
-- The previous app role connected as a superuser with BYPASSRLS=true, which
-- would make any RLS policy here a no-op -- confirmed via
-- `SELECT usesuper, rolbypassrls FROM pg_user ...` before writing this.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_role;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

-- `app.current_user_id` / `app.is_admin` are set per query by
-- config/db.js's queryAsUser wrapper. `current_setting(..., true)` returns
-- NULL (not an error) when unset, so an unauthenticated/background query
-- with no context correctly sees nothing rather than erroring out.
DROP POLICY IF EXISTS conversations_isolation ON conversations;
CREATE POLICY conversations_isolation ON conversations
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR user_id = current_setting('app.current_user_id', true)::integer
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR user_id = current_setting('app.current_user_id', true)::integer
  );

DROP POLICY IF EXISTS messages_isolation ON messages;
CREATE POLICY messages_isolation ON messages
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR conversation_id IN (
      SELECT id FROM conversations WHERE user_id = current_setting('app.current_user_id', true)::integer
    )
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR conversation_id IN (
      SELECT id FROM conversations WHERE user_id = current_setting('app.current_user_id', true)::integer
    )
  );
