import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { extractText, SUPPORTED_KNOWLEDGE_MIME_TYPES } from '../knowledge/textExtraction.js';
import { parseCatalogText } from './catalogParser.js';
import { computeExtractionConfidence, needsReview } from './confidence.js';
import { diffAndApplyCatalog } from './catalogDiff.js';
import { createReviewItem } from '../reviewQueue/reviewItemsService.js';

async function recordFailedRun({ facilityId, filename, mimeType, submittedBy, error, linesTotal = 0, linesParsed = 0 }) {
  const { rows } = await query(
    `INSERT INTO canteen_extraction_runs (facility_id, source_filename, source_mime_type, status, lines_total, lines_parsed, error, submitted_by)
     VALUES ($1,$2,$3,'failed',$4,$5,$6,$7) RETURNING id`,
    [facilityId, filename, mimeType, linesTotal, linesParsed, error, submittedBy],
  );
  return { status: 'failed', runId: rows[0].id, error };
}

/**
 * Shared tail end of both ingestion entry points below, once each has its
 * own way of obtaining `text` (and, for the OCR path, an externally-computed
 * `ocrConfidence`) — parses it into catalog items, scores confidence, diffs
 * against the facility's current state, and feeds anything uncertain into
 * the shared review queue (migration 034).
 */
async function processExtractedText({ facilityId, filename, mimeType, submittedBy, text, ocrConfidence }) {
  if (!text || text.trim().length === 0) {
    return recordFailedRun({
      facilityId,
      filename,
      mimeType,
      submittedBy,
      error: 'Dokument jest pusty lub nie udało się odczytać z niego tekstu.',
    });
  }

  const { items, linesTotal, linesParsed } = await parseCatalogText(text);

  if (items.length === 0) {
    return recordFailedRun({
      facilityId,
      filename,
      mimeType,
      submittedBy,
      error: 'Nie rozpoznano żadnej pozycji cennika w dokumencie.',
      linesTotal,
      linesParsed,
    });
  }

  const confidence = computeExtractionConfidence({ ocrConfidence, linesTotal, linesParsed });

  const { rows: runRows } = await query(
    `INSERT INTO canteen_extraction_runs (facility_id, source_filename, source_mime_type, status, confidence, lines_total, lines_parsed, submitted_by)
     VALUES ($1,$2,$3,'ok',$4,$5,$6,$7) RETURNING id`,
    [facilityId, filename, mimeType, confidence, linesTotal, linesParsed, submittedBy],
  );
  const runId = runRows[0].id;

  let changes;
  try {
    changes = await diffAndApplyCatalog({ facilityId, extractionRunId: runId, parsedItems: items });
  } catch (err) {
    logger.error('Canteen ingestion: catalog diff failed', { facilityId, runId, error: err.message });
    await query(`UPDATE canteen_extraction_runs SET status = 'failed', error = $1 WHERE id = $2`, [err.message, runId]);
    return { status: 'failed', runId, error: `Zapis zmian do katalogu nie powiódł się: ${err.message}` };
  }

  const flaggedChanges = changes.filter((c) => c.flagged);
  const lowConfidence = needsReview(confidence);
  const status = lowConfidence || flaggedChanges.length > 0 ? 'partial' : 'ok';
  if (status !== 'ok') {
    await query(`UPDATE canteen_extraction_runs SET status = $1 WHERE id = $2`, [status, runId]);
  }

  // One entry for the whole run when something about the extraction itself
  // is uncertain, plus one PER flagged change (price jump / mass removal) —
  // ordinary, unsuspicious adds/removes/price-changes never reach the
  // queue (signal, not noise).
  if (status !== 'ok') {
    await createReviewItem({
      itemType: 'canteen_catalog',
      title: 'Import kantyny wymaga przeglądu',
      rationale: lowConfidence
        ? `Niska pewność odczytu (${confidence.toFixed(2)}) — ${linesParsed}/${linesTotal} linii rozpoznanych.`
        : `${flaggedChanges.length} podejrzanych zmian w tym imporcie.`,
      sourceLabel: `Kantyna #${facilityId} — ${filename}`,
      sourceRef: { facilityId, extractionRunId: runId },
      externalRef: `canteen_run:${runId}`,
      confidence,
    });
  }

  for (const change of flaggedChanges) {
    await createReviewItem({
      itemType: 'canteen_catalog',
      title: `Kantyna #${facilityId}: ${change.flagReason}`,
      rationale: change.flagReason,
      sourceLabel: `Kantyna #${facilityId} — ${change.normalizedName}`,
      sourceRef: { facilityId, extractionRunId: runId, changeId: change.id },
      externalRef: `canteen_change:${change.id}`,
      confidence,
    });
  }

  return { status, runId, confidence, linesTotal, linesParsed, changes };
}

/**
 * Entry point for an already-digital catalog document (xlsx/csv/pdf/docx)
 * uploaded through the UI (POST /canteen/facilities/:id/documents) or the
 * CLI script — never a photo/scan. No OCR happens in this process at all:
 * a photo/scan is OCR'd externally and arrives via ingestCanteenOcrText
 * below instead.
 */
export async function ingestCanteenDocument({ facilityId, buffer, filename, mimeType, submittedBy = null }) {
  if (!SUPPORTED_KNOWLEDGE_MIME_TYPES.has(mimeType)) {
    return recordFailedRun({ facilityId, filename, mimeType, submittedBy, error: `Nieobsługiwany typ pliku: ${mimeType}` });
  }

  let text;
  try {
    text = await extractText(buffer, mimeType);
  } catch (err) {
    logger.error('Canteen ingestion: text extraction failed', { facilityId, filename, error: err.message });
    return recordFailedRun({
      facilityId,
      filename,
      mimeType,
      submittedBy,
      error: `Nie udało się odczytać pliku: ${err.message}`,
    });
  }

  return processExtractedText({ facilityId, filename, mimeType, submittedBy, text, ocrConfidence: null });
}

/**
 * Entry point for text an EXTERNAL OCR service has already extracted from a
 * canteen catalog photo/scan (see routes/canteen.routes.js's
 * POST /facilities/:id/ocr-import, authenticated by a shared webhook token,
 * not a user JWT). This backend never runs OCR itself for canteen catalogs.
 * `confidence`, when the caller provides one, is that external engine's own
 * score (0-100, the same scale Tesseract reports) — folded into
 * computeExtractionConfidence alongside the parser's own parse rate.
 */
export async function ingestCanteenOcrText({ facilityId, text, confidence = null, filename = 'ocr-import', submittedBy = null }) {
  return processExtractedText({
    facilityId,
    filename,
    mimeType: 'text/plain',
    submittedBy,
    text,
    ocrConfidence: confidence,
  });
}
