const PATTERNS = [
  { name: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'PESEL', regex: /\b\d{11}\b/g },
  { name: 'KARTA_PLATNICZA', regex: /\b(?:\d[ -]?){13,19}\b/g },
  { name: 'TELEFON', regex: /(?:\+48[ -]?)?\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g },
];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Holds the token<->value map and running per-category counters, so every
 * piece of text redacted through it (the specialist's message, and later
 * any BigQuery/RAG tool output) shares a single token numbering and a
 * single map — a second `redact()` call continues counting from `[EMAIL_2]`
 * instead of restarting at `[EMAIL_1]` and silently clobbering the first
 * match's map entry. `terms` are literal client/brand names (loaded from
 * the `redaction_terms` table) redacted the same way as the regex patterns,
 * categorized under each term's own category (e.g. `KLIENT`).
 *
 * `initialState` (`{ map, counts }`) seeds the session from a conversation's
 * previously persisted state — without this, every turn would restart
 * counters at 1, so the literal token `[KLIENT_1]` saved in turn 1's history
 * and a freshly minted `[KLIENT_1]` in turn 3 could refer to two completely
 * different real values once both are replayed together in the same
 * `messages` array sent to the model. Seeding keeps tokens unique for the
 * lifetime of the conversation. The map itself still never leaves this
 * process's memory except via the caller persisting `session.map`/
 * `session.counts` back to storage — it's never sent to the model or logged.
 */
export function createRedactionSession(terms = [], initialState = {}) {
  const map = { ...(initialState.map ?? {}) };
  const counts = { ...(initialState.counts ?? {}) };
  const categories = new Set();

  function tokenize(name, match) {
    counts[name] = (counts[name] ?? 0) + 1;
    const token = `[${name}_${counts[name]}]`;
    map[token] = match;
    categories.add(name);
    return token;
  }

  function redact(text) {
    let redacted = text;
    for (const { name, regex } of PATTERNS) {
      redacted = redacted.replace(regex, (match) => tokenize(name, match));
    }
    for (const term of terms) {
      if (!term?.term) continue;
      const category = term.category || 'KLIENT';
      // \b only matches at a word/non-word transition, so it can't anchor
      // next to a term edge that's already non-word (e.g. "Sp. z o.o." ends
      // in "."); only add the boundary on whichever edge is a word char.
      const leadingBoundary = /^\w/.test(term.term) ? '\\b' : '';
      const trailingBoundary = /\w$/.test(term.term) ? '\\b' : '';
      const regex = new RegExp(`${leadingBoundary}${escapeRegExp(term.term)}${trailingBoundary}`, 'gi');
      redacted = redacted.replace(regex, (match) => tokenize(category, match));
    }
    return redacted;
  }

  return {
    redact,
    restore: (text) => restorePii(text, map),
    createChunker: (onChunk) => createDetokenizingChunker(map, onChunk),
    map,
    counts,
    get categories() {
      return Array.from(categories);
    },
  };
}

/**
 * One-shot convenience wrapper around `createRedactionSession` for callers
 * that only need to redact a single piece of text (no tool results to fold
 * into the same map afterwards).
 */
export function redactPii(text, terms = []) {
  const session = createRedactionSession(terms);
  const redacted = session.redact(text);
  return { redacted, map: session.map, categories: session.categories };
}

/** Reverses redactPii's tokens back to their real values — used only on the response leg, never persisted. */
export function restorePii(text, map) {
  if (!map || Object.keys(map).length === 0) return text;
  let restored = text;
  for (const [token, value] of Object.entries(map)) {
    restored = restored.split(token).join(value);
  }
  return restored;
}

/**
 * Wraps a streaming onChunk callback so PII tokens are de-tokenized as text
 * arrives, without ever emitting a half-formed token (e.g. "[EMAIL_" cut
 * mid-delta). Holds back an unmatched trailing "[" until its closing "]"
 * shows up in a later chunk; call flush() once the stream ends to release
 * anything still buffered (e.g. if the model literally ends on a "[").
 * `map` is read live on every push (not just at creation), because tool
 * results discovered mid-stream (via a shared redaction session) can add
 * new tokens after streaming has already started.
 */
export function createDetokenizingChunker(map, onChunk) {
  let buffer = '';
  function emit(upTo) {
    if (upTo <= 0) return;
    const chunk = restorePii(buffer.slice(0, upTo), map);
    if (chunk) onChunk(chunk);
    buffer = buffer.slice(upTo);
  }
  return {
    push(delta) {
      if (buffer.length === 0 && (!map || Object.keys(map).length === 0)) {
        onChunk(delta);
        return;
      }
      buffer += delta;
      const lastOpen = buffer.lastIndexOf('[');
      const flushTo = lastOpen === -1 || buffer.indexOf(']', lastOpen) !== -1 ? buffer.length : lastOpen;
      emit(flushTo);
    },
    flush() {
      emit(buffer.length);
    },
  };
}
