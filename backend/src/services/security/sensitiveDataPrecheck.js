import { completeText, OLLAMA_MODEL } from '../ollamaClient.js';
import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';

// `||`, not `??`: .env ships `PRECHECK_MODEL=` (present but empty, not
// unset), so `??` never falls back -- every precheck call was failing with
// "model is required" and silently failing open (logged as an error on
// every single message sent).
export const PRECHECK_MODEL = process.env.PRECHECK_MODEL || OLLAMA_MODEL;
const PRECHECK_ENABLED = process.env.PRECHECK_ENABLED !== 'false';
// Below this confidence, a żółta/czerwona verdict is flagged for manager
// review instead of hard-blocked — an uncertain call from the classifier
// shouldn't stop legitimate traffic. High-confidence verdicts still block
// immediately, per the original "better a false block than a real leak" policy.
const PRECHECK_CONFIDENCE_THRESHOLD = Number(process.env.PRECHECK_CONFIDENCE_THRESHOLD ?? 0.6);

// Mirrors the company's 3-poziomowa klasyfikacja danych (zielona/żółta/czerwona).
// Kluczowa zasada: klasyfikujemy KONKRETNE DANE zawarte w wiadomości, nie jej
// temat. Pytanie specjalisty o proces, status czy sposób pracy — nawet
// dotyczące klientów, zamówień czy kantyn w sposób ogólny — jest ZIELONE,
// dopóki nie niesie ze sobą realnych, identyfikujących danych (nazwisk,
// ID klienta/zamówienia powiązanego z danymi osobowymi, adresów, kwot płatności,
// danych kontaktowych itp.). Blokujemy dane, nie ciekawość czy pytania.
const PRECHECK_PROMPT = `Klasyfikujesz jedną wiadomość użytkownika PRZED wysłaniem jej do modelu AI, wg firmowej klasyfikacji danych. Oceniasz WYŁĄCZNIE to, czy wiadomość zawiera KONKRETNE, REALNE dane — nie to, jakiego tematu dotyczy pytanie. ZIELONA jest kategorią domyślną: w razie wątpliwości zawsze wybieraj ZIELONĄ. ŻÓŁTĄ i CZERWONĄ zarezerwuj wyłącznie dla wiadomości, w których faktycznie i jednoznacznie pojawiają się realne dane identyfikujące — pojedyncza wzmianka o zamówieniu, kantynie czy przybliżonej kwocie bez pełnych danych identyfikujących to wciąż ZIELONA.

ZIELONA — wszystko, co nie jest jednoznacznie i konkretnie danymi wrażliwymi: ogólne pytania o proces obsługi zamówień/reklamacji, status wysyłek, definicje, przykłady, szkice odpowiedzi dla klientów — nawet jeśli wspominają o "zamówieniu", "kliencie", "paczce", przybliżonej kwocie czy nazwie kantyny/placówki, dopóki nie towarzyszy temu pełny zestaw danych identyfikujących konkretną osobę (np. imię+nazwisko+adres/kontakt, ID zamówienia+ID klienta+dane osobowe). To domyślna, najczęstsza kategoria — używaj jej zawsze, gdy nie masz stuprocentowej pewności, że to ŻÓŁTA lub CZERWONA.
ZOLTA — wiadomość zawiera konkretne, jednoznacznie identyfikujące dane wewnętrzne firmy: realne imię i nazwisko pracownika wraz z danymi go dotyczącymi, pełny ID zamówienia/klienta wraz z konkretnymi danymi finansowymi/handlowymi tego zamówienia, obszerne fragmenty wewnętrznych cenników/strategii z danymi liczbowymi.
CZERWONA — wiadomość zawiera konkretne, jednoznacznie identyfikujące dane klientów/osadzonych: pełne dane osobowe (imię+nazwisko+adres/kontakt, PESEL itp.), ID zamówienia lub ID klienta powiązane z danymi osobowymi konkretnej osoby, dane płatności, treści reklamacji z danymi osobowymi nadawcy lub odbiorcy paczki.

Przykłady:
- "Jak wygląda standardowy proces realizacji zamówienia paczki do osadzonego?" → ZIELONA.
- "Napisz przykładową odpowiedź dla klienta pytającego o czas dostawy paczki" → ZIELONA.
- "Mamy zamówienie o wartości około 200 zł, czy to mieści się w limicie kantyny tej jednostki?" → ZIELONA (brak ID zamówienia/klienta ani danych osobowych, tylko przybliżona kwota i ogólny kontekst).
- "Zamówienie #48213, klient Jan Kowalski, ul. Przykładowa 5, 00-001 Warszawa, PESEL 90010112345" → ZOLTA/CZERWONA (ID zamówienia/klienta powiązane z pełnym zestawem danych identyfikujących).
- "Podsumuj to zgłoszenie: [treść z danymi osobowymi nadawcy paczki]" → CZERWONA.

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
 * Pure classification call — no DB, no consent check, no fail-open/closed
 * decision. Runs PRECHECK_PROMPT against PRECHECK_MODEL and parses the
 * verdict. Throws on any failure (bad response, unparseable JSON, network
 * error); it is the caller's job to decide what "the classifier is down"
 * means for them — `precheckMessage` below fails open (a chat outage is
 * worse than an unclassified message getting through), while a hard gate
 * like the document gateway (`services/gateway/documentGateway.js`) should
 * fail closed instead. Shared by both so the classification policy itself
 * — the prompt, the model, what counts as ZIELONA/ZOLTA/CZERWONA — never
 * drifts between the two call sites.
 */
export async function classifyContent(text) {
  const { text: responseText } = await completeText({ model: PRECHECK_MODEL, system: PRECHECK_PROMPT, prompt: text });

  const jsonText = (responseText || '{}').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const verdict = JSON.parse(jsonText);

  const rawLevel = String(verdict.level ?? 'ZIELONA').toUpperCase();
  return {
    level: LEVEL_LABELS[rawLevel] ?? 'zielona',
    category: verdict.category ?? null,
    confidence: typeof verdict.confidence === 'number' ? verdict.confidence : Number(verdict.confidence),
    rationale: verdict.rationale ?? null,
  };
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
    verdict = await classifyContent(userMessage);
  } catch (err) {
    logger.error('Sensitive data pre-check failed, failing open', { conversationId, error: err.message });
    return { blocked: false, level: 'zielona' };
  }

  const level = verdict.level;
  const isRisky = level === 'żółta' || level === 'czerwona';
  const confidence = verdict.confidence;
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
