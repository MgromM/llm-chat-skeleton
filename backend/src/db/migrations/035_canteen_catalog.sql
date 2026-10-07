-- Canteen ("kantyna") catalog ingestion: OCR/photo + already-structured-file
-- imports of each prison facility's product catalog, diffed against a
-- materialized current state. Ordinary changes (a price nudge, a product
-- added/removed) are applied immediately; anything confidence.js flags as
-- implausible (a 5x+ price jump, a mass removal) is logged but held back
-- (applied = false) for a human to confirm -- see canteenIngestion.js /
-- catalogDiff.js. Flagged runs/changes also feed review_items (migration
-- 034) so they surface in the header bell for any employee.

CREATE TABLE IF NOT EXISTS canteen_facilities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  external_code TEXT UNIQUE,
  city TEXT,
  address TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Materialized current state (not a snapshot per import) -- cheap "what's
-- the price right now" reads, no duplicated catalogs piling up on disk.
-- History of what changed lives in canteen_catalog_changes below.
CREATE TABLE IF NOT EXISTS canteen_products (
  id SERIAL PRIMARY KEY,
  facility_id INTEGER NOT NULL REFERENCES canteen_facilities(id) ON DELETE CASCADE,
  normalized_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  unit TEXT,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_canteen_products_facility_name ON canteen_products(facility_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_canteen_products_facility_active ON canteen_products(facility_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS canteen_extraction_runs (
  id SERIAL PRIMARY KEY,
  facility_id INTEGER NOT NULL REFERENCES canteen_facilities(id) ON DELETE CASCADE,
  source_filename TEXT NOT NULL,
  source_mime_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'failed')),
  confidence NUMERIC(3,2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  lines_total INTEGER NOT NULL DEFAULT 0,
  lines_parsed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canteen_extraction_runs_facility ON canteen_extraction_runs(facility_id, created_at DESC);

-- Append-only log of what each import changed: added/removed/price_changed/
-- reappeared (a previously-removed item that's back). display_name/unit/
-- new_price are duplicated here (not just looked up via product_id) so a
-- held-back change can be applied later, from this row alone, without
-- re-parsing the original document.
CREATE TABLE IF NOT EXISTS canteen_catalog_changes (
  id SERIAL PRIMARY KEY,
  extraction_run_id INTEGER NOT NULL REFERENCES canteen_extraction_runs(id) ON DELETE CASCADE,
  facility_id INTEGER NOT NULL REFERENCES canteen_facilities(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES canteen_products(id) ON DELETE SET NULL,
  normalized_name TEXT NOT NULL,
  display_name TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('added', 'removed', 'price_changed', 'reappeared')),
  old_price NUMERIC(10,2),
  new_price NUMERIC(10,2),
  unit TEXT,
  flagged_implausible BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  applied BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canteen_catalog_changes_run ON canteen_catalog_changes(extraction_run_id);
CREATE INDEX IF NOT EXISTS idx_canteen_catalog_changes_facility ON canteen_catalog_changes(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canteen_catalog_changes_unapplied ON canteen_catalog_changes(facility_id) WHERE applied = false;
