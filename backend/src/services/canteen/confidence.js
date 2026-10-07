export const CANTEEN_REVIEW_CONFIDENCE_THRESHOLD = Number(process.env.CANTEEN_REVIEW_CONFIDENCE_THRESHOLD ?? 0.7);
const CANTEEN_PRICE_JUMP_RATIO = Number(process.env.CANTEEN_PRICE_JUMP_RATIO ?? 5);
const CANTEEN_MASS_REMOVAL_RATIO = Number(process.env.CANTEEN_MASS_REMOVAL_RATIO ?? 0.3);

/**
 * Weighted extraction confidence for one import: how much of the document
 * the OCR engine itself was sure about, plus how much of it catalogParser.js
 * actually recognized as product lines. `ocrConfidence` is null for
 * already-structured files (xlsx/csv/pdf/docx) -- those never go through
 * Tesseract, so there's no engine confidence to weigh, and the parse rate
 * alone stands in for the whole score rather than quietly multiplying it by
 * a `null`-derived zero.
 */
export function computeExtractionConfidence({ ocrConfidence, linesTotal, linesParsed }) {
  const parseRate = linesTotal > 0 ? linesParsed / linesTotal : 0;
  if (ocrConfidence == null) return Math.max(0, Math.min(1, parseRate));
  const ocrTerm = ocrConfidence / 100;
  return Math.max(0, Math.min(1, 0.4 * ocrTerm + 0.6 * parseRate));
}

export function needsReview(confidence) {
  return !Number.isFinite(confidence) || confidence < CANTEEN_REVIEW_CONFIDENCE_THRESHOLD;
}

/**
 * Flags a price change in EITHER direction -- a crash to a fraction of the
 * old price is just as likely a misread (OCR dropping a digit) as a genuine
 * spike, and both deserve the same "don't apply silently" treatment.
 */
export function isImplausiblePriceChange(oldPrice, newPrice) {
  if (!(oldPrice > 0) || !(newPrice > 0)) return false;
  const ratio = Math.max(oldPrice, newPrice) / Math.min(oldPrice, newPrice);
  return ratio >= CANTEEN_PRICE_JUMP_RATIO;
}

/** `previousActiveCount` is the facility's active product count BEFORE this import. */
export function isMassRemoval(removedCount, previousActiveCount) {
  if (previousActiveCount <= 0) return false;
  return removedCount / previousActiveCount >= CANTEEN_MASS_REMOVAL_RATIO;
}
