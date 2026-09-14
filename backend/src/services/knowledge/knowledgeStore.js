import fs from 'node:fs/promises';
import pgvector from 'pgvector';
import { query } from '../../config/db.js';
import { chunkText } from './chunking.js';
import { embedTexts } from './embeddings.js';

const SEARCH_TOP_K = 5;

export async function createDocument({ title, filename, mimeType, sizeBytes, storagePath, uploadedBy }) {
  const { rows } = await query(
    `INSERT INTO knowledge_documents (title, filename, mime_type, size_bytes, storage_path, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title, filename, mimeType, sizeBytes, storagePath, uploadedBy],
  );
  return rows[0].id;
}

/** Chunks and embeds a document's extracted text, storing each chunk with its embedding. */
export async function indexDocument(documentId, text) {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const embeddings = await embedTexts(chunks, { inputType: 'document' });

  const values = [];
  const params = [];
  chunks.forEach((chunk, i) => {
    const offset = i * 4;
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
    params.push(documentId, i, chunk, pgvector.toSql(embeddings[i]));
  });
  await query(
    `INSERT INTO knowledge_chunks (document_id, chunk_index, content, embedding) VALUES ${values.join(', ')}`,
    params,
  );
  return chunks.length;
}

export async function listDocuments() {
  const { rows } = await query(
    `SELECT d.id, d.title, d.filename, d.mime_type, d.size_bytes, d.created_at, u.email AS uploaded_by_email,
            (SELECT count(*)::int FROM knowledge_chunks c WHERE c.document_id = d.id) AS chunk_count
     FROM knowledge_documents d
     JOIN users u ON u.id = d.uploaded_by
     ORDER BY d.created_at DESC`,
  );
  return rows;
}

export async function deleteDocument(id) {
  const { rows } = await query('SELECT storage_path FROM knowledge_documents WHERE id = $1', [id]);
  if (rows.length === 0) return false;

  await query('DELETE FROM knowledge_documents WHERE id = $1', [id]);
  await fs.unlink(rows[0].storage_path).catch(() => {});
  return true;
}

/** Finds the most semantically relevant chunks for a query embedding, across all documents. */
export async function searchKnowledge(queryEmbedding, topK = SEARCH_TOP_K) {
  const { rows } = await query(
    `SELECT c.content, d.title AS document_title
     FROM knowledge_chunks c
     JOIN knowledge_documents d ON d.id = c.document_id
     ORDER BY c.embedding <=> $1
     LIMIT $2`,
    [pgvector.toSql(queryEmbedding), topK],
  );
  return rows;
}
