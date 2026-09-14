import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Storage } from '@google-cloud/storage';

const STORAGE_BACKEND = process.env.STORAGE_BACKEND ?? 'local';

const UPLOAD_DIR = process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), 'uploads');
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR ?? path.join(process.cwd(), 'uploads', 'knowledge');

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TEXT_MIME_TYPES = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);

export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;

export function isImageAttachment(mimeType) {
  return IMAGE_MIME_TYPES.has(mimeType);
}

export function isTextAttachment(mimeType) {
  return TEXT_MIME_TYPES.has(mimeType);
}

let gcsClient;
function getBucket() {
  if (!gcsClient) gcsClient = new Storage({ projectId: process.env.GCP_PROJECT_ID || undefined });
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error('GCS_BUCKET_NAME is required when STORAGE_BACKEND=gcs');
  return gcsClient.bucket(bucketName);
}

function objectKey(originalName, prefix) {
  const safeExt = path.extname(originalName).slice(0, 10);
  return `${prefix}/${randomUUID()}${safeExt}`;
}

/**
 * Storage path format is opaque to callers: a local filesystem path when
 * STORAGE_BACKEND=local, or a `gs://<bucket>/<object-key>` URI when
 * STORAGE_BACKEND=gcs. Only this module interprets it.
 */
async function saveBuffer(buffer, originalName, dir, prefix) {
  if (STORAGE_BACKEND === 'gcs') {
    const bucket = getBucket();
    const key = objectKey(originalName, prefix);
    await bucket.file(key).save(buffer);
    return `gs://${bucket.name}/${key}`;
  }
  await fs.mkdir(dir, { recursive: true });
  const safeExt = path.extname(originalName).slice(0, 10);
  const storagePath = path.join(dir, `${randomUUID()}${safeExt}`);
  await fs.writeFile(storagePath, buffer);
  return storagePath;
}

function parseGcsUri(storagePath) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(storagePath);
  if (!match) return null;
  return { bucketName: match[1], key: match[2] };
}

/** Saves an uploaded file's buffer and returns its opaque storage path. */
export async function saveAttachmentFile(buffer, originalName) {
  return saveBuffer(buffer, originalName, UPLOAD_DIR, 'attachments');
}

export async function readAttachmentFile(storagePath) {
  const gcs = parseGcsUri(storagePath);
  if (gcs) {
    const [buffer] = await gcsClient.bucket(gcs.bucketName).file(gcs.key).download();
    return buffer;
  }
  return fs.readFile(storagePath);
}

/** Deletes an attachment's file. Safe to call even if the file is already gone. */
export async function deleteAttachmentFile(storagePath) {
  const gcs = parseGcsUri(storagePath);
  if (gcs) {
    await gcsClient
      .bucket(gcs.bucketName)
      .file(gcs.key)
      .delete({ ignoreNotFound: true });
    return;
  }
  await fs.unlink(storagePath).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
}

/** Same as `saveAttachmentFile` but for knowledge-base documents, kept in their own prefix/subdirectory. */
export async function saveKnowledgeFile(buffer, originalName) {
  return saveBuffer(buffer, originalName, KNOWLEDGE_DIR, 'knowledge');
}
