import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';

/**
 * Records WHICH CATEGORIES of sensitive data were involved in a turn sent
 * to the model — never the values themselves. Kept in a table separate
 * from usage_metrics/precheck_results (cost/debug logs) specifically so
 * "what data categories left the company, and when" can be answered
 * without keeping a second copy of the sensitive data anywhere. Never
 * throws — an audit-log failure must not block the chat.
 */
export async function logAiAudit({ conversationId, userId, piiCategories, precheck, model, purpose }) {
  try {
    const categories = new Set(piiCategories ?? []);
    if (precheck?.category && precheck.category !== 'BRAK') categories.add(precheck.category);

    await query(
      `INSERT INTO ai_audit_log (conversation_id, user_id, data_categories_sent, redaction_applied, precheck_level, model, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [conversationId, userId, Array.from(categories), (piiCategories ?? []).length > 0, precheck?.level ?? null, model, purpose ?? null],
    );
  } catch (err) {
    logger.error('Failed to write ai_audit_log entry', { conversationId, userId, error: err.message });
  }
}
