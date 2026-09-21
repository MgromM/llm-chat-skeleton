-- Artifacts produced by the 4 deliverable slash commands (brief kreatywny,
-- teksty reklamowe, pomysły na posty, analiza konkurencji) as first-class,
-- versioned records instead of being re-derived from messages.content on
-- every render. `type` is 'markdown' (default) or 'html' when the reply
-- contains an embedded ```html/```svg block, in which case `preview_content`
-- on the current version holds the extracted markup for the live iframe
-- preview. `share_token` backs the public, unauthenticated share link.
CREATE TABLE IF NOT EXISTS artifacts (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  command_used TEXT,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'markdown',
  current_version INTEGER NOT NULL DEFAULT 1,
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifact_versions (
  id SERIAL PRIMARY KEY,
  artifact_id INTEGER NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  preview_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, version)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_conversation ON artifacts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact ON artifact_versions(artifact_id);
