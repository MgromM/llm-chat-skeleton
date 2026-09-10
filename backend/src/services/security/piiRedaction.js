const PATTERNS = [
  { name: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'PESEL', regex: /\b\d{11}\b/g },
  { name: 'KARTA_PLATNICZA', regex: /\b(?:\d[ -]?){13,19}\b/g },
  { name: 'TELEFON', regex: /(?:\+48[ -]?)?\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g },
];

/**
 * Replaces likely PII (emails, PESEL, card/phone numbers) with placeholders.
 * Applied once, at the point a user message enters the system, before it is
 * persisted or sent to the Anthropic API — so sensitive data never lands in
 * our DB or with the LLM provider.
 */
export function redactPii(text) {
  let redacted = text;
  for (const { name, regex } of PATTERNS) {
    redacted = redacted.replace(regex, `[${name}]`);
  }
  return redacted;
}
