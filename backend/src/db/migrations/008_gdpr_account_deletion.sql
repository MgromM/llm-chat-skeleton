-- Lets a user's account be deleted (GDPR "right to erasure") without
-- failing on knowledge_documents.uploaded_by, the one FK to users that
-- wasn't ON DELETE CASCADE. Knowledge base documents are shared company
-- resources, not personal data, so we keep them and just null out the
-- uploader reference instead of cascading the delete.
ALTER TABLE knowledge_documents ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_uploaded_by_fkey;
ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
