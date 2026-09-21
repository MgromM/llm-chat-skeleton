-- Item 14 (docs/tasks/007-ui-ux-braki.md, section D): "Projects" like
-- Claude.ai -- group conversations around shared instructions, scoped to
-- the owning user the same way `conversations`/`clients` are (a plain
-- `user_id` FK, filtered by RLS -- see 026/027).
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);

-- Same RLS pattern as 026/027: the restricted `salesmore_app` role only
-- sees its own rows unless the request context is marked admin.
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_isolation ON projects;
CREATE POLICY projects_isolation ON projects
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
  );
