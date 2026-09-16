import { query } from '../../config/db.js';
import { estimateCostUsd } from '../anthropicClient.js';

/**
 * Records cost/latency for a single assistant message. commandUsed is the
 * slash command name if one triggered this response, otherwise null.
 */
export async function recordUsage({
  messageId,
  model,
  inputTokens,
  outputTokens,
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
  latencyMs,
  commandUsed,
}) {
  const costUsd = estimateCostUsd(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) ?? 0;
  await query(
    `INSERT INTO usage_metrics
       (message_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd, latency_ms, command_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [messageId, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, costUsd, latencyMs, commandUsed ?? null],
  );
  return costUsd;
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

// Same grouping as getCostSummary, plus the average judge score for that
// model/command bucket, so reports can show cost and quality side by side.
export async function getCostAndQualitySummary({ from, to }) {
  const { rows } = await query(
    `SELECT um.model, um.command_used,
            COUNT(*) AS requests,
            SUM(um.input_tokens) AS input_tokens,
            SUM(um.output_tokens) AS output_tokens,
            SUM(um.cost_usd) AS cost_usd,
            AVG(um.latency_ms) AS avg_latency_ms,
            ROUND(AVG(qs.score), 2) AS avg_quality_score,
            COUNT(qs.score) AS scored_messages
     FROM usage_metrics um
     LEFT JOIN quality_scores qs ON qs.message_id = um.message_id
     WHERE um.created_at BETWEEN $1 AND $2
     GROUP BY um.model, um.command_used
     ORDER BY cost_usd DESC`,
    [from, to],
  );
  return rows;
}
