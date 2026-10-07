-- Shared review queue: a single place for "someone should take a look at
-- this" items produced by different pipelines (canteen catalog ingestion,
-- email complaint triage, more item_types later). Visible to every
-- logged-in employee (see reviewItems.routes.js -- requireAuth only, no
-- requireRole), unlike leak_alerts which is restricted to managers/admins --
-- so, like leak_alerts/clients, no RLS here (only conversations/messages/
-- projects have RLS, see migrations 026/028).
CREATE TABLE IF NOT EXISTS review_items (
  id SERIAL PRIMARY KEY,
  item_type TEXT NOT NULL CHECK (item_type IN ('canteen_catalog', 'email_complaint')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_url TEXT,
  source_ref JSONB,
  external_ref TEXT,
  confidence NUMERIC(3,2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_items_item_type ON review_items(item_type);
CREATE INDEX IF NOT EXISTS idx_review_items_reviewed ON review_items(reviewed);
CREATE INDEX IF NOT EXISTS idx_review_items_unreviewed_created ON review_items(created_at DESC) WHERE reviewed = false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_items_external_ref ON review_items(item_type, external_ref) WHERE external_ref IS NOT NULL;
