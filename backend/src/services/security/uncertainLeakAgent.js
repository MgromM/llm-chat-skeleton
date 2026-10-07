import { completeText, OLLAMA_MODEL } from '../ollamaClient.js';
import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { sendNotificationEmail } from '../notifications/resendMailer.js';

const LEAK_AGENT_MODEL = process.env.LEAK_AGENT_MODEL ?? OLLAMA_MODEL;
const DEFAULT_CONTEXT_MESSAGES = Number(process.env.LEAK_AGENT_DEFAULT_CONTEXT ?? 5);

const LEAK_AGENT_PROMPT = `Analizujesz fragment rozmowy pracownika firmy z asystentem AI pod kątem NIEJEDNOZNACZNYCH, niepewnych sygnałów wycieku danych — przypadków, które NIE są na tyle oczywiste, by je twardo zablokować (to robi osobny, bardziej rygorystyczny pre-check), ale mimo to mogą oznaczać, że dane wrażliwe lub poufne firmowe wypłynęły albo są na granicy wypłynięcia.
Przykłady niepewnych sygnałów: aluzyjne odniesienia do konkretnych osób/kwot bez wprost podanych danych, fragmentaryczne dane, które w połączeniu z kontekstem mogłyby zidentyfikować osobę, niejasne pytania o obejście zasad, podejrzanie szczegółowe dane wewnętrzne bez oczywistego uzasadnienia biznesowego.
Zwykłe pytania biznesowe, nawet dotyczące konkretnych projektów czy klientów w sposób ogólny, NIE są podejrzane.
Odpowiedz WYŁĄCZNIE w formacie JSON: {"suspicious": <true|false>, "category": "<PII|DANE_FIRMOWE|AI_ACT|INNE|BRAK>", "confidence": <0-1>, "rationale": "<jedno zdanie po polsku>"}.`;

function stripJsonFence(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

async function loadRecentMessages(conversationId, limit) {
  const { rows } = await query(
    `SELECT role, content, created_at FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit],
  );
  return rows.reverse();
}

/**
 * Fire-and-forget agent, separate from the hard-block pre-check, that flags
 * ambiguous-but-worrying messages instead of blocking them. Runs after the
 * user-facing reply so it never adds latency, and never throws — a failure
 * here must not affect the chat itself. Reads the last N messages of the
 * conversation as context for whoever reviews the alert (N is per-user
 * configurable via users.leak_context_messages, falling back to
 * LEAK_AGENT_DEFAULT_CONTEXT; if fewer messages exist, uses however many
 * there actually are).
 */
export async function detectUncertainLeak({ conversationId, userId, userMessage }) {
  try {
    const { rows: userRows } = await query('SELECT leak_context_messages, email FROM users WHERE id = $1', [userId]);
    const contextLimit = userRows[0]?.leak_context_messages ?? DEFAULT_CONTEXT_MESSAGES;
    const reporterEmail = userRows[0]?.email ?? null;

    const context = await loadRecentMessages(conversationId, contextLimit);
    const transcript = context.map((m) => `${m.role}: ${m.content}`).join('\n');

    const { text } = await completeText({
      model: LEAK_AGENT_MODEL,
      system: LEAK_AGENT_PROMPT,
      prompt: `Ostatnia wiadomość do oceny: ${userMessage}\n\nKontekst rozmowy:\n${transcript}`,
    });
    const verdict = JSON.parse(stripJsonFence(text || '{}'));

    if (verdict.suspicious !== true) {
      return { suspicious: false };
    }

    await query(
      `INSERT INTO leak_alerts (conversation_id, user_id, category, confidence, rationale, context, judge_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        conversationId,
        userId,
        verdict.category ?? null,
        verdict.confidence ?? null,
        verdict.rationale ?? null,
        JSON.stringify(context),
        LEAK_AGENT_MODEL,
      ],
    );

    logger.warn('Uncertain data leak signal flagged for review', {
      conversationId,
      userId,
      category: verdict.category,
      confidence: verdict.confidence,
    });

    // Fire-and-forget, same as the rest of this function: the alert is
    // already durably saved above (visible in GET /metrics/leak-alerts
    // regardless of email delivery), this is just so a reviewer doesn't
    // have to keep polling that dashboard to notice a new one.
    const notifyTo = process.env.LEAK_ALERT_NOTIFY_EMAIL || process.env.SUPPORT_NOTIFY_EMAIL;
    if (notifyTo) {
      sendNotificationEmail({
        to: notifyTo,
        subject: `[LLM App] Możliwy wyciek danych (${verdict.category ?? 'brak kategorii'})`,
        text: [
          `Zgłaszający: ${reporterEmail ?? `user #${userId}`}`,
          `Rozmowa: ${conversationId}`,
          `Kategoria: ${verdict.category ?? '—'}`,
          `Pewność: ${verdict.confidence ?? '—'}`,
          `Uzasadnienie: ${verdict.rationale ?? '—'}`,
          '',
          `Przejrzyj w panelu: GET /metrics/leak-alerts`,
        ].join('\n'),
        context: 'leak-alert',
      }).catch(() => {});
    }

    return { suspicious: true, category: verdict.category, rationale: verdict.rationale };
  } catch (err) {
    logger.error('Uncertain leak agent failed', { conversationId, userId, error: err.message });
    return { suspicious: false };
  }
}
