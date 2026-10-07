import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';

/**
 * Write API for the shared review queue (see migration 034). Called
 * in-process by whichever pipeline produces a reviewable item (canteen
 * catalog ingestion, email complaint triage, more later) -- never by an
 * HTTP route directly, that's what reviewItems.routes.js's GET endpoints
 * are for.
 *
 * Mirrors uncertainLeakAgent.js's detectUncertainLeak: never throws, so a
 * failure here (bad connection, unexpected input) can't take down the
 * caller's own pipeline -- it's logged and swallowed, same outcome as a
 * silently-skipped duplicate `(item_type, external_ref)`.
 */
export async function createReviewItem({
  itemType,
  title,
  rationale,
  sourceLabel,
  sourceUrl = null,
  sourceRef = null,
  externalRef = null,
  confidence = null,
}) {
  try {
    const { rows } = await query(
      `INSERT INTO review_items (item_type, title, rationale, source_label, source_url, source_ref, external_ref, confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (item_type, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        itemType,
        title,
        rationale,
        sourceLabel,
        sourceUrl,
        sourceRef ? JSON.stringify(sourceRef) : null,
        externalRef,
        confidence,
      ],
    );
    // No rows back means the ON CONFLICT ... DO NOTHING branch fired (a
    // duplicate external_ref for this item_type) -- not an error, just
    // nothing new to review.
    return rows[0]?.id ?? null;
  } catch (err) {
    logger.error('createReviewItem failed', { itemType, externalRef, error: err.message });
    return null;
  }
}
