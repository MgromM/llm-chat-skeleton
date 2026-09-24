import { classifyContent } from '../security/sensitiveDataPrecheck.js';
import { redactPii } from '../security/piiRedaction.js';
import { getRedactionTerms } from '../security/redactionTerms.js';
import { extractTextFromImages } from '../security/ocrExtraction.js';
import { extractText, SUPPORTED_KNOWLEDGE_MIME_TYPES } from '../knowledge/textExtraction.js';
import { isImageAttachment } from '../attachments/attachmentStore.js';
import { logger } from '../../config/logger.js';

const MAX_CHARS = Number(process.env.DOCUMENT_GATEWAY_MAX_CHARS ?? 20_000);

/**
 * Standalone document gate, decoupled from the chat pipeline
 * (`chatCore/pipeline.js`): no conversationId, no client-consent lookup, no
 * persisted redaction session. Every call is a clean slate — a document
 * either gets a verdict or an explicit error, nothing is carried between
 * calls. Meant to sit in front of *any* downstream LLM use of the document
 * (Claude Code, this chat app, anything else), not just this product's own
 * chat — see `backend/scripts/check-document.mjs` for the CLI entry point
 * and `routes/documentGateway.routes.js` for the HTTP one.
 *
 * Deliberately fail-CLOSED, unlike `precheckMessage` (which fails open so a
 * classifier outage never takes down the chat). A gate whose entire job is
 * "tell me if this is safe" must never silently stand in for "yes, safe"
 * when it couldn't actually check — that's the one failure mode that would
 * make the gate worse than not having one. A classifier error is reported
 * as `level: 'BŁĄD'`, distinct from the three real verdicts.
 */
export async function checkDocument({ buffer, filename, mimeType }) {
  let rawText;
  try {
    rawText = await extractDocumentText({ buffer, filename, mimeType });
  } catch (err) {
    logger.error('Document gateway: text extraction failed', { filename, mimeType, error: err.message });
    return {
      filename,
      level: 'BŁĄD',
      error: `Nie udało się odczytać pliku: ${err.message}`,
    };
  }

  if (rawText === null) {
    return {
      filename,
      level: 'NIEOBSŁUGIWANY',
      error: `Nieobsługiwany typ pliku: ${mimeType}. Obsługiwane: obrazy (OCR), PDF, DOCX, XLSX, PPTX, TXT/CSV/MD/JSON.`,
    };
  }

  const truncated = rawText.length > MAX_CHARS;
  const text = truncated ? rawText.slice(0, MAX_CHARS) : rawText;

  if (text.trim().length === 0) {
    return { filename, level: 'PUSTY', truncated, charCount: 0 };
  }

  let redacted;
  let piiCategories;
  try {
    const terms = await getRedactionTerms();
    ({ redacted, categories: piiCategories } = redactPii(text, terms));
  } catch (err) {
    // Same fail-closed contract as the classification step below — a
    // redaction-terms lookup failure must not let unredacted text slip
    // through to the classifier, and must not throw out of this function
    // (every call site expects a structured result, never an exception).
    logger.error('Document gateway: PII redaction failed', { filename, error: err.message });
    return {
      filename,
      level: 'BŁĄD',
      error: `Redakcja danych nie powiodła się: ${err.message}. Nie zakładaj, że dokument jest bezpieczny — spróbuj ponownie.`,
      truncated,
    };
  }

  let verdict;
  try {
    verdict = await classifyContent(redacted);
  } catch (err) {
    logger.error('Document gateway: classification failed', { filename, error: err.message });
    return {
      filename,
      level: 'BŁĄD',
      error: `Klasyfikacja nie powiodła się: ${err.message}. Nie zakładaj, że dokument jest bezpieczny — spróbuj ponownie.`,
      piiCategories,
      truncated,
    };
  }

  return {
    filename,
    level: verdict.level,
    category: verdict.category,
    confidence: verdict.confidence,
    rationale: verdict.rationale,
    piiCategories,
    redactedText: redacted,
    truncated,
    charCount: text.length,
  };
}

/** Returns extracted plain text, or `null` for a mime type this gate doesn't know how to read. */
async function extractDocumentText({ buffer, filename, mimeType }) {
  if (isImageAttachment(mimeType)) {
    return extractTextFromImages([{ buffer, filename }]);
  }
  if (SUPPORTED_KNOWLEDGE_MIME_TYPES.has(mimeType)) {
    return extractText(buffer, mimeType);
  }
  return null;
}
