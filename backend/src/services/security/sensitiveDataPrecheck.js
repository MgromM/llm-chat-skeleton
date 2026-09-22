import { getAnthropicClient } from '../anthropicClient.js';
import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';

export const PRECHECK_MODEL = process.env.PRECHECK_MODEL ?? 'claude-haiku-4-5-20251001';
const PRECHECK_ENABLED = process.env.PRECHECK_ENABLED !== 'false';
// Below this confidence, a żółta/czerwona verdict is flagged for manager
// review instead of hard-blocked — an uncertain call from the classifier
// shouldn't stop legitimate traffic. High-confidence verdicts still block
// immediately, per the original "better a false block than a real leak" policy.
const PRECHECK_CONFIDENCE_THRESHOLD = Number(process.env.PRECHECK_CONFIDENCE_THRESHOLD ?? 0.6);

// Mirrors Agencji's 3-poziomowa klasyfikacja danych (zielona/żółta/czerwona).
// Kluczowa zasada: klasyfikujemy KONKRETNE DANE zawarte w wiadomości, nie jej
// temat. Pytanie specjalisty o poradę, strategię czy sposób pracy — nawet
// dotyczące klientów, kampanii czy branży w sposób ogólny — jest ZIELONE,
// dopóki nie niesie ze sobą realnych, identyfikujących danych (nazwisk,
// nazw konkretnych klientów, numerów, kwot, treści umów, danych kontaktowych
// itp.). Blokujemy dane, nie ciekawość czy pytania.
const PRECHECK_PROMPT = `Klasyfikujesz jedną wiadomość użytkownika Sales&More PRZED wysłaniem jej do modelu AI, wg firmowej klasyfikacji danych. Oceniasz WYŁĄCZNIE to, czy wiadomość zawiera KONKRETNE, REALNE dane — nie to, jakiego tematu dotyczy pytanie. ZIELONA jest kategorią domyślną: w razie wątpliwości zawsze wybieraj ZIELONĄ. ŻÓŁTĄ i CZERWONĄ zarezerwuj wyłącznie dla wiadomości, w których faktycznie i jednoznacznie pojawiają się realne dane identyfikujące — pojedyncza wzmianka o firmie, branży, stanowisku czy przybliżonej kwocie bez pełnych danych identyfikujących to wciąż ZIELONA.

ZIELONA — wszystko, co nie jest jednoznacznie i konkretnie danymi wrażliwymi: ogólne pytania biznesowe, marketingowe, o strategię, sposób pracy, definicje, przykłady, ćwiczenia, burza mózgów, szkice tekstów, pytania o narzędzia czy branżę — nawet jeśli wspominają o "kliencie", "kampanii", "budżecie", nazwie branży, przybliżonej kwocie czy ogólnym stanowisku, dopóki nie towarzyszy temu pełny zestaw danych identyfikujących konkretną osobę lub podmiot (np. imię+nazwisko+kontakt, pełna nazwa firmy+kwota+dane osoby). To domyślna, najczęstsza kategoria — używaj jej zawsze, gdy nie masz stuprocentowej pewności, że to ŻÓŁTA lub CZERWONA.
ZOLTA — wiadomość zawiera konkretne, jednoznacznie identyfikujące dane wewnętrzne Agencji: realne imię i nazwisko pracownika wraz z danymi go dotyczącymi, pełną nazwę konkretnego klienta Agencji wraz z konkretnymi danymi finansowymi/handlowymi, obszerne fragmenty wewnętrznej strategii z danymi liczbowymi.
CZERWONA — wiadomość zawiera konkretne, jednoznacznie identyfikujące dane klientów/konsumentów: pełne dane osobowe (imię+nazwisko+kontakt, PESEL itp.), treści umów, tajemnicę handlową, wyniki badań z danymi respondentów, briefy z danymi osobowymi.

Przykłady:
- "Jak zbudować strategię social media dla klienta z branży FMCG?" → ZIELONA.
- "Napisz mi przykładowy brief kreatywny" → ZIELONA.
- "Mamy klienta z budżetem rzędu 50 tys. na kwartał, jak zaplanować miks kanałów?" → ZIELONA (brak danych identyfikujących, tylko przybliżona kwota i ogólny kontekst).
- "Klient XYZ Sp. z o.o., budżet 50000 zł na Q3, kontakt: Jan Kowalski jan@xyz.pl" → ZOLTA/CZERWONA (pełny zestaw danych identyfikujących).
- "Podsumuj ten brief: [treść z danymi respondentów badania]" → CZERWONA.

Jeśli nie masz pewności, czy dane są konkretne/realne czy tylko przykładowe/hipotetyczne/ogólne — traktuj jako ZIELONA (nie blokuj samego pytania, blokuj tylko wtedy, gdy pełne, realne dane identyfikujące faktycznie są obecne w treści).

Odpowiedz WYŁĄCZNIE w formacie JSON: {"level": "<ZIELONA|ZOLTA|CZERWONA>", "category": "<PII|DANE_FIRMOWE|TAJEMNICA_HANDLOWA|AI_ACT|PROMPT_INJECTION|BRAK>", "confidence": <0-1>, "rationale": "<jedno zdanie po polsku>"}.`;

const LEVEL_LABELS = { ZIELONA: 'zielona', ZOLTA: 'żółta', CZERWONA: 'czerwona' };

async function checkClientConsent(conversationId) {
  const { rows } = await query(
    `SELECT c.ai_consent
     FROM conversations conv
     JOIN clients c ON c.id = conv.client_id
     WHERE conv.id = $1`,
    [conversationId],
  );
  if (rows.length === 0) return true;
  return rows[0].ai_consent === true;
}

/**
 * Classification pre-check run BEFORE every message reaches the Anthropic
 * API. Classifies into the company's zielona/żółta/czerwona data policy —
 * żółta and czerwona are hard-blocked immediately when the classifier is
 * confident (per policy, better a false block than a real leak); below
 * PRECHECK_CONFIDENCE_THRESHOLD they're flagged for manager review instead,
 * so an uncertain call doesn't stop legitimate traffic. A conversation whose
 * client has not given AI consent (`clients.ai_consent`) is blocked outright,
 * before the Haiku call — a plain DB check, no model round-trip needed.
 * Fails open: if the check itself errors out, the message is allowed through
 * (treated as zielona) and the failure is logged loudly, so a precheck
 * outage never takes down the whole chat.
 */
export async function precheckMessage({ conversationId, userMessage }) {
  if (!PRECHECK_ENABLED) {
    return { blocked: false, level: 'zielona' };
  }

  try {
    const hasConsent = await checkClientConsent(conversationId);
    if (!hasConsent) {
      logger.warn('Message hard-blocked by pre-check: client has not given AI consent', { conversationId });
      await persistPrecheckResult({ conversationId, blocked: true, category: 'NO_CONSENT', confidence: 1, rationale: 'Klient nie wyraził zgody na przetwarzanie danych przy użyciu AI.', level: 'czerwona', needsReview: false });
      return { blocked: true, level: 'czerwona', category: 'NO_CONSENT', rationale: 'Klient nie wyraził zgody na przetwarzanie danych przy użyciu AI.' };
    }
  } catch (err) {
    logger.error('Client AI-consent check failed, continuing to content pre-check', { conversationId, error: err.message });
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
  const isRisky = level === 'żółta' || level === 'czerwona';
  const confidence = typeof verdict.confidence === 'number' ? verdict.confidence : Number(verdict.confidence);
  // Below threshold (or confidence missing/unparseable), don't hard-block —
  // flag for manager review instead, since an uncertain call shouldn't stop
  // legitimate traffic.
  const isConfident = Number.isFinite(confidence) && confidence >= PRECHECK_CONFIDENCE_THRESHOLD;
  const blocked = isRisky && isConfident;
  const needsReview = isRisky && !isConfident;

  await persistPrecheckResult({
    conversationId,
    blocked,
    category: verdict.category ?? null,
    confidence: Number.isFinite(confidence) ? confidence : null,
    rationale: verdict.rationale ?? null,
    level,
    needsReview,
  });

  if (blocked) {
    logger.warn('Message hard-blocked by sensitive data pre-check', {
      conversationId,
      level,
      category: verdict.category,
      confidence,
    });
  } else if (needsReview) {
    logger.warn('Message flagged for review by sensitive data pre-check (low confidence)', {
      conversationId,
      level,
      category: verdict.category,
      confidence,
    });
  }

  return { blocked, needsReview, level, category: verdict.category, rationale: verdict.rationale };
}

async function persistPrecheckResult({ conversationId, blocked, category, confidence, rationale, level, needsReview }) {
  try {
    await query(
      `INSERT INTO precheck_results (conversation_id, blocked, category, confidence, rationale, judge_model, level, needs_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [conversationId, blocked, category, confidence, rationale, PRECHECK_MODEL, level, needsReview],
    );
  } catch (err) {
    logger.error('Failed to persist pre-check result', { conversationId, error: err.message });
  }
}
