import { getAnthropicClient } from '../anthropicClient.js';
import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';

const PRECHECK_MODEL = process.env.PRECHECK_MODEL ?? 'claude-haiku-4-5-20251001';
const PRECHECK_ENABLED = process.env.PRECHECK_ENABLED !== 'false';

// Mirrors Agencji's 3-poziomowa klasyfikacja danych (zielona/żółta/czerwona).
const PRECHECK_PROMPT = `Klasyfikujesz jedną wiadomość użytkownika Sales&More PRZED wysłaniem jej do modelu AI, wg firmowej klasyfikacji danych:
ZIELONA — dane publiczne, nieosobowe, niezastrzeżone (ogólnodostępne dane rynkowe, treści kreatywne do ćwiczeń). Bez ograniczeń.
ZOLTA — dane wewnętrzne Agencji, dane osobowe pracowników, informacje handlowe (dane finansowe Agencji, nazwy klientów, wewnętrzne strategie).
CZERWONA — dane klientów, dane osobowe konsumentów, tajemnica handlowa, umowy (briefy z danymi osobowymi, wyniki badań z danymi respondentów).
Jeśli wiadomość jest zwykłym pytaniem biznesowym/marketingowym bez takich danych — to ZIELONA, nawet jeśli dotyczy kampanii czy klientów w sposób ogólny.
Odpowiedz WYŁĄCZNIE w formacie JSON: {"level": "<ZIELONA|ZOLTA|CZERWONA>", "category": "<PII|DANE_FIRMOWE|TAJEMNICA_HANDLOWA|AI_ACT|PROMPT_INJECTION|BRAK>", "confidence": <0-1>, "rationale": "<jedno zdanie po polsku>"}.`;

const LEVEL_LABELS = { ZIELONA: 'zielona', ZOLTA: 'żółta', CZERWONA: 'czerwona' };

/**
 * Classification pre-check run BEFORE every message reaches the Anthropic
 * API. Classifies into the company's zielona/żółta/czerwona data policy —
 * żółta and czerwona are hard-blocked immediately (per policy, no
 * confidence threshold: better a false block than a real leak). Fails
 * open: if the check itself errors out, the message is allowed through
 * (treated as zielona) and the failure is logged loudly, so a precheck
 * outage never takes down the whole chat.
 */
export async function precheckMessage({ conversationId, userMessage }) {
  if (!PRECHECK_ENABLED) {
    return { blocked: false, level: 'zielona' };
  }

  let verdict;
  try {
    const client = await getAnthropicClient();
    const response = await client.messages.create({
      model: PRECHECK_MODEL,
      max_tokens: 200,
      system: PRECHECK_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    verdict = JSON.parse(jsonText);
  } catch (err) {
    logger.error('Sensitive data pre-check failed, failing open', { conversationId, error: err.message });
    return { blocked: false, level: 'zielona' };
  }

  const rawLevel = String(verdict.level ?? 'ZIELONA').toUpperCase();
  const level = LEVEL_LABELS[rawLevel] ?? 'zielona';
  const blocked = level === 'żółta' || level === 'czerwona';

  try {
    await query(
      `INSERT INTO precheck_results (conversation_id, blocked, category, confidence, rationale, judge_model, level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [conversationId, blocked, verdict.category ?? null, verdict.confidence ?? null, verdict.rationale ?? null, PRECHECK_MODEL, level],
    );
  } catch (err) {
    logger.error('Failed to persist pre-check result', { conversationId, error: err.message });
  }

  if (blocked) {
    logger.warn('Message hard-blocked by sensitive data pre-check', {
      conversationId,
      level,
      category: verdict.category,
      confidence: verdict.confidence,
    });
  }

  return { blocked, level, category: verdict.category, rationale: verdict.rationale };
}
