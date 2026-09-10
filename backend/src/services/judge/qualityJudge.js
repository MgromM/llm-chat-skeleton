import { getAnthropicClient } from '../anthropicClient.js';
import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';

const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'claude-haiku-4-5-20251001';

const JUDGE_PROMPT = `Oceniasz jakość jednej odpowiedzi asystenta AI dla specjalisty Sales&More.
Odpowiedz WYŁĄCZNIE w formacie JSON: {"score": <1-5>, "rationale": "<jedno zdanie po polsku>"}.
1 = bezużyteczna/błędna, 5 = trafna, konkretna i kompletna.`;

/**
 * Cheap second LLM call that scores the assistant's answer. Runs
 * fire-and-forget after the user-facing response has already been sent, so
 * it never adds latency to the chat itself.
 */
export async function judgeResponse({ messageId, userQuestion, assistantAnswer }) {
  try {
    const client = await getAnthropicClient();
    const response = await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 200,
      system: JUDGE_PROMPT,
      messages: [
        { role: 'user', content: `Pytanie: ${userQuestion}\n\nOdpowiedź: ${assistantAnswer}` },
      ],
    });

    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const { score, rationale } = JSON.parse(jsonText);

    await query(
      'INSERT INTO quality_scores (message_id, judge_model, score, rationale) VALUES ($1, $2, $3, $4)',
      [messageId, JUDGE_MODEL, score, rationale],
    );
  } catch (err) {
    logger.error('Quality judge failed', { messageId, error: err.message });
  }
}
