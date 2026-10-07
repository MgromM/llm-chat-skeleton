import { completeText, OLLAMA_MODEL } from '../ollamaClient.js';
import { query } from '../../config/db.js';

const COMPLIANCE_AGENT_MODEL = process.env.COMPLIANCE_AGENT_MODEL ?? OLLAMA_MODEL;

const COMPLIANCE_AGENT_PROMPT = `Oceniasz, czy fragment tekstu przeznaczony do wysłania do zewnętrznego modelu AI jest zgodny z firmowymi zasadami compliance.
Szukaj: danych osobowych (PII) klienta końcowego, danych finansowych/umownych oznaczonych jako poufne, oraz treści które mogłyby zidentyfikować konkretną osobę fizyczną spoza kontekstu biznesowego.
Zwykłe pytania biznesowe, nawet ze szczegółami projektu, NIE są problemem.
Odpowiedz WYŁĄCZNIE w formacie JSON: {"flagged": <true|false>, "reason": "<jedno zdanie po polsku, albo pusty string>"}.`;

function stripJsonFence(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/**
 * Rule-first, Haiku-fallback compliance check for a single outgoing text
 * against a client. No RAG — decided in the compliance plan (point 7):
 * too few historical incidents yet to make vector similarity worthwhile.
 * Returns as soon as a rule fails, so a missing consent never depends on
 * a model call.
 */
export async function checkClientCompliance({ clientId, text }) {
  if (clientId != null) {
    const { rows } = await query('SELECT ai_consent FROM clients WHERE id = $1', [clientId]);
    if (rows.length === 0) {
      return { compliant: false, reason: 'NO_SUCH_CLIENT' };
    }
    if (rows[0].ai_consent !== true) {
      return { compliant: false, reason: 'NO_CONSENT' };
    }
  }

  const { text: responseText } = await completeText({ model: COMPLIANCE_AGENT_MODEL, system: COMPLIANCE_AGENT_PROMPT, prompt: text });
  const verdict = JSON.parse(stripJsonFence(responseText || '{}'));

  if (verdict.flagged === true) {
    return { compliant: false, reason: verdict.reason || 'FLAGGED_BY_AGENT' };
  }
  return { compliant: true, reason: null };
}
