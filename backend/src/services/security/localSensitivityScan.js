// Fully local, offline heuristic scan — no LLM call, no network request.
// Unlike sensitiveDataPrecheck.js (which classifies a chat message via the
// Anthropic API), this module only ever runs regex/keyword rules in-process,
// so it can be used as a "is this file safe to paste into Claude?" check for
// specialists without the file's content ever leaving this server process —
// and the caller (localCheck.routes.js) never persists the file or the text.

// Reuses the same field-level regexes as piiRedaction.js's PATTERNS, plus a
// few extra Polish-business identifiers that aren't relevant to in-chat
// token redaction but are strong signals of "this file has real client data".
const FIELD_PATTERNS = [
  { name: 'EMAIL', weight: 1, regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'TELEFON', weight: 1, regex: /(?:\+48[ -]?)?\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g },
  { name: 'PESEL', weight: 3, regex: /\b\d{11}\b/g },
  { name: 'NIP', weight: 2, regex: /\bNIP[:\s]*\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}\b/gi },
  { name: 'REGON', weight: 2, regex: /\bREGON[:\s]*\d{9,14}\b/gi },
  { name: 'IBAN', weight: 3, regex: /\b(?:PL)?\d{2}[ -]?(?:\d{4}[ -]?){6}\d{0,4}\b/g },
  { name: 'KARTA_PLATNICZA', weight: 3, regex: /\b(?:\d[ -]?){13,19}\b/g },
];

// Keyword-based signals: things a regex can't catch, weighted lower than a
// hard PII match since a single keyword alone is often just topic, not data
// (mirrors sensitiveDataPrecheck.js's "temat vs. dane" distinction).
const KEYWORD_GROUPS = [
  {
    category: 'TAJEMNICA_HANDLOWA',
    weight: 2,
    words: ['poufne', 'poufna', 'tajemnica handlowa', 'nda', 'confidential', 'strictly confidential', 'do użytku wewnętrznego'],
  },
  {
    category: 'UMOWA',
    weight: 2,
    words: ['umowa', 'aneks do umowy', 'strony umowy', 'wynagrodzenie ryczałtowe', 'kara umowna'],
  },
  {
    category: 'DANE_FINANSOWE',
    weight: 2,
    words: ['numer konta', 'nr konta', 'wynagrodzenie brutto', 'wynagrodzenie netto', 'kwota umowy'],
  },
];

const RED_THRESHOLD = 5;
const YELLOW_THRESHOLD = 2;

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Scans one piece of already-extracted text (from OCR, PDF/DOCX/XLSX/PPTX
 * parsing, or a plain .txt) and returns a zielona/żółta/czerwona verdict with
 * per-category hit counts, entirely from local pattern matching.
 */
export function scanTextLocally(text) {
  const hits = [];
  let score = 0;

  for (const { name, weight, regex } of FIELD_PATTERNS) {
    const count = countMatches(text, regex);
    if (count > 0) {
      hits.push({ category: name, count });
      score += count * weight;
    }
  }

  const lowerText = text.toLowerCase();
  for (const { category, weight, words } of KEYWORD_GROUPS) {
    const count = words.reduce((acc, word) => acc + (lowerText.includes(word) ? 1 : 0), 0);
    if (count > 0) {
      hits.push({ category, count });
      score += count * weight;
    }
  }

  let level = 'zielona';
  if (score >= RED_THRESHOLD) level = 'czerwona';
  else if (score >= YELLOW_THRESHOLD) level = 'żółta';

  return { level, score, hits };
}

const LEVEL_MESSAGES = {
  zielona: 'Nie wykryto w treści żadnych oznak danych wrażliwych ani poufnych. Plik wygląda bezpiecznie do wklejenia do Claude, ale finalną ocenę zawsze podejmujesz Ty.',
  żółta: 'Wykryto pojedyncze dane, które mogą identyfikować osobę lub firmę (np. e-mail, telefon, numer NIP/REGON) albo słowa wskazujące na dane wewnętrzne/finansowe. Zalecamy NIE wklejać tego pliku do Claude bez wcześniejszego usunięcia lub zanonimizowania tych danych.',
  czerwona: 'Wykryto silne sygnały danych osobowych lub poufnych (np. PESEL, numer karty płatniczej/konta, wiele danych kontaktowych naraz albo treść umowy). NIE wklejaj tego pliku do Claude — dane powinny zostać zanonimizowane lub usunięte przed jakimkolwiek dalszym przetwarzaniem przez AI.',
};

const CATEGORY_LABELS = {
  EMAIL: 'adresy e-mail',
  TELEFON: 'numery telefonów',
  PESEL: 'numery PESEL',
  NIP: 'numery NIP',
  REGON: 'numery REGON',
  IBAN: 'numery kont bankowych (IBAN)',
  KARTA_PLATNICZA: 'numery kart płatniczych',
  TAJEMNICA_HANDLOWA: 'oznaczenia poufności / NDA',
  UMOWA: 'treści charakterystyczne dla umów',
  DANE_FINANSOWE: 'dane finansowe (wynagrodzenia, numery kont)',
};

/** Builds a human-readable Polish rationale from the hit list, for the UI. */
export function explainVerdict({ level, hits }) {
  if (hits.length === 0) return LEVEL_MESSAGES[level];
  const details = hits
    .map(({ category, count }) => `${CATEGORY_LABELS[category] ?? category} (${count})`)
    .join(', ');
  return `${LEVEL_MESSAGES[level]} Znalezione sygnały: ${details}.`;
}
