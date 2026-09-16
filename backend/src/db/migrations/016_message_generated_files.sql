-- Files the model created via `code_execution` (e.g. a generated .csv/.xlsx
-- report) get a `file_id` in Anthropic's Files API — this stores that id
-- (plus filename/mime type for display) against the assistant message that
-- produced it, so the frontend can offer a download link.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS generated_files JSONB;
