import { getAnthropicClient } from '../anthropicClient.js';
import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';

export const PRECHECK_MODEL = process.env.PRECHECK_MODEL ?? 'claude-haiku-4-5-20251001';
const PRECHECK_ENABLED = process.env.PRECHECK_ENABLED !== 'false';

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
