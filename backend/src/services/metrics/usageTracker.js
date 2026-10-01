import { query } from '../../config/db.js';

/**
 * Records token usage/latency for a single assistant message. A local Ollama
 * model has no per-token price, so cost tracking (previously estimated from
 * Anthropic's published pricing) is gone — cost_usd is always 0, kept as a
 * column only so existing queries/dashboards built against it don't break.
 * commandUsed is the slash command name if one triggered this response,
 * otherwise null.
 */
export async function recordUsage({ messageId, model, inputTokens, outputTokens, latencyMs, commandUsed }) {
  await query(
    `INSERT INTO usage_metrics
       (message_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd, latency_ms, command_used)
     VALUES ($1, $2, $3, $4, 0, 0, 0, $5, $6)`,
    [messageId, model, inputTokens, outputTokens, latencyMs, commandUsed ?? null],
  );
  return 0;
}

export async function getCostSummary({ from, to }) {
  const { rows } = await query(
    `SELECT model, command_used,
            COUNT(*) AS requests,
            SUM(input_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(cost_usd) AS cost_usd,
            AVG(latency_ms) AS avg_latency_ms
     FROM usage_metrics
     WHERE created_at BETWEEN $1 AND $2
     GROUP BY model, command_used
     ORDER BY cost_usd DESC`,
    [from, to],
  );
  return rows;
}

// Cost per specialist, for spotting heavy users before a billing-model
// decision (flat seat vs. per-usage) has to be made.
export async function getCostByUser({ from, to }) {
  const { rows } = await query(
    `SELECT u.id AS user_id, u.email,
            COUNT(*) AS requests,
            SUM(um.input_tokens) AS input_tokens,
            SUM(um.output_tokens) AS output_tokens,
            SUM(um.cost_usd) AS cost_usd
     FROM usage_metrics um
     JOIN messages m ON m.id = um.message_id
     JOIN conversations c ON c.id = m.conversation_id
     JOIN users u ON u.id = c.user_id
     WHERE um.created_at BETWEEN $1 AND $2
     GROUP BY u.id, u.email
     ORDER BY cost_usd DESC`,
    [from, to],
  );
  return rows;
}

