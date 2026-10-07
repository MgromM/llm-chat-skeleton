import { completeText, OLLAMA_MODEL } from '../ollamaClient.js';
import { logger } from '../../config/logger.js';

// `||`, not `??`: an env file shipping `CANTEEN_PARSER_MODEL=` (present but
// empty, not unset) must still fall back to OLLAMA_MODEL -- see the same
// footgun already present in sensitiveDataPrecheck.js's PRECHECK_MODEL.
const CANTEEN_PARSER_MODEL = process.env.CANTEEN_PARSER_MODEL || OLLAMA_MODEL;
// A badly-OCR'd scan can produce many junk lines (headers, page numbers,
// smudged rows) that the regex below will never match -- without a cap,
// every one of those would cost a separate serial Ollama call. Same class of
// guard as OLLAMA_NUM_PREDICT / MAX_OCR_CHARS_PER_IMAGE elsewhere in this
// codebase: past this many fallback attempts per document, remaining
// unparsed lines are just skipped (counted in linesTotal, not linesParsed).
const MAX_FALLBACK_LINES = Number(process.env.CANTEEN_PARSER_MAX_FALLBACK_LINES ?? 80);

// Matches "Nazwa produktu    12,50 zł", "Nazwa - 3.00 zł/szt", "Nazwa: 4,00".
// Decimal separator may be a comma or a dot; "zł"/"PLN" and a "/unit" suffix
// are both optional so plain "Nazwa 12,50" still matches.
const LINE_PATTERN = /^(?<name>.+?)[\s.\-–—:]*\s(?<price>\d{1,4}[.,]\d{2})\s*(?:zł|PLN)?\s*(?:\/\s*(?<unit>\p{L}+))?\s*$/iu;

function parseLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return null;
  const match = LINE_PATTERN.exec(line);
  if (!match?.groups) return null;

  const name = match.groups.name.replace(/[\s.\-–—:]+$/, '').trim();
  if (!name) return null;

  const price = Number(match.groups.price.replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0) return null;

  return { name, price, unit: match.groups.unit?.toLowerCase() ?? null };
}

const FALLBACK_PROMPT = `Wyodrębnij z poniższej POJEDYNCZEJ linii dokumentu kantyny więziennej nazwę produktu i jego cenę w złotych, jeśli to faktycznie pozycja cennika (a nie nagłówek, numer strony czy inny tekst). Odpowiedz WYŁĄCZNIE w formacie JSON: {"isProduct": <true|false>, "name": "<nazwa produktu lub null>", "price": <cena jako liczba lub null>, "unit": "<jednostka np. szt/kg lub null>"}.`;

async function parseLineWithFallback(rawLine) {
  try {
    const { text } = await completeText({ model: CANTEEN_PARSER_MODEL, system: FALLBACK_PROMPT, prompt: rawLine });
    const jsonText = (text || '{}').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(jsonText);
    const price = Number(parsed.price);
    if (parsed.isProduct !== true || !parsed.name || !Number.isFinite(price) || price <= 0) return null;
    return { name: String(parsed.name).trim(), price, unit: parsed.unit ? String(parsed.unit).toLowerCase() : null };
  } catch (err) {
    logger.error('Canteen catalog parser: Ollama fallback failed for one line', { error: err.message });
    return null;
  }
}

/**
 * Parses raw extracted catalog text into {name, price, unit} items, one per
 * line. Regex-first (cheap, deterministic, handles the large majority of
 * "Nazwa  12,50 zł" style lines); only lines the regex can't parse fall back
 * to a per-line Ollama call, never the whole document through the LLM at
 * once -- keeps this fast and avoids a single hallucinated rewrite of the
 * entire catalog standing in for a real parse.
 */
export async function parseCatalogText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  let fallbackAttempts = 0;

  for (const line of lines) {
    const regexResult = parseLine(line);
    if (regexResult) {
      items.push(regexResult);
      continue;
    }
    if (fallbackAttempts >= MAX_FALLBACK_LINES) continue;
    fallbackAttempts += 1;
    const fallbackResult = await parseLineWithFallback(line);
    if (fallbackResult) items.push(fallbackResult);
  }

  return { items, linesTotal: lines.length, linesParsed: items.length };
}
