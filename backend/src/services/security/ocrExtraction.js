import { createWorker } from 'tesseract.js';
import { logger } from '../../config/logger.js';

const OCR_LANGS = process.env.OCR_LANGS ?? 'eng+pol';
const MAX_OCR_CHARS_PER_IMAGE = 5_000;

/**
 * Extracts text from a single image attachment via Tesseract OCR. Runs
 * locally, no network call — this is the "basic OCR" step, swappable later
 * for a cloud OCR provider (e.g. Google Cloud Vision) without touching the
 * call site in pipeline.js.
 */
async function ocrImage(buffer) {
  // Without an errorHandler, tesseract.js rethrows recognize() failures
  // (e.g. a corrupt image) synchronously inside its internal message
  // handler on top of rejecting the promise, which crashes the process
  // even though we already catch the rejection below.
  const worker = await createWorker(OCR_LANGS, undefined, { errorHandler: () => {} });
  try {
    const { data } = await worker.recognize(buffer);
    return (data.text ?? '').trim().slice(0, MAX_OCR_CHARS_PER_IMAGE);
  } finally {
    await worker.terminate();
  }
}

/**
 * Runs OCR over every image attachment and returns their extracted text
 * joined into one block, so it can be fed into the sensitive-data precheck
 * alongside the message text. Fails open per-image by default: an OCR error
 * on one attachment is logged and skipped, never blocks the turn — right
 * for the chat, where the rest of the message should still get through.
 *
 * `onFailure(file, err)` is an opt-in escape hatch for callers that can't
 * accept that silence — the document gateway (`services/gateway/
 * documentGateway.js`) fails closed, so it needs to know a failed OCR read
 * happened rather than see it collapse into "no text found".
 */
export async function extractTextFromImages(images, { onFailure } = {}) {
  if (!images || images.length === 0) return '';

  const chunks = [];
  for (const file of images) {
    try {
      const text = await ocrImage(file.buffer);
      if (text) chunks.push(`--- OCR (${file.filename}) ---\n${text}`);
    } catch (err) {
      logger.error('OCR extraction failed for attachment, skipping', { filename: file.filename, error: err.message });
      onFailure?.(file, err);
    }
  }
  return chunks.join('\n\n');
}
