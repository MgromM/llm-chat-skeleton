import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRedactionSession, restorePii, createDetokenizingChunker } from './piiRedaction.js';

// Simulates one full request: the specialist's message is redacted first,
// then a (fictional) BigQuery tool result containing the SAME client name
// and a fresh PESEL comes back and is redacted through the same session —
// this is the exact flow wired into pipeline.js's tool loop.
test('shared session redacts across multiple redact() calls without token collisions', () => {
  const session = createRedactionSession([{ term: 'Fikcyjny Klient Sp. z o.o.', category: 'KLIENT' }]);

  const userText = 'Przygotuj brief dla Fikcyjny Klient Sp. z o.o., kontakt jan@example.com';
  const safeUserText = session.redact(userText);
  assert.match(safeUserText, /\[KLIENT_1\]/);
  assert.match(safeUserText, /\[EMAIL_1\]/);
  assert.doesNotMatch(safeUserText, /Fikcyjny Klient/);
  assert.doesNotMatch(safeUserText, /jan@example\.com/);

  const toolResultRaw = JSON.stringify({
    rows: [{ client: 'Fikcyjny Klient Sp. z o.o.', budget_pln: 50000, contact: 'anna@example.com' }],
  });
  const safeToolResult = session.redact(toolResultRaw);
  // Second occurrence of the SAME term must get the NEXT number, not
  // restart at _1 and silently overwrite the first map entry.
  assert.match(safeToolResult, /\[KLIENT_2\]/);
  assert.match(safeToolResult, /\[EMAIL_2\]/);
  assert.doesNotMatch(safeToolResult, /Fikcyjny Klient/);
  assert.doesNotMatch(safeToolResult, /anna@example\.com/);
  assert.match(safeToolResult, /50000/); // budget itself isn't PII-shaped, stays as-is (expected)

  // Both original values must still be independently recoverable.
  assert.equal(session.map['[KLIENT_1]'], 'Fikcyjny Klient Sp. z o.o.');
  assert.equal(session.map['[KLIENT_2]'], 'Fikcyjny Klient Sp. z o.o.');
  assert.equal(session.map['[EMAIL_1]'], 'jan@example.com');
  assert.equal(session.map['[EMAIL_2]'], 'anna@example.com');

  assert.equal(session.restore(safeUserText), userText);
});

test('PESEL/phone/card patterns are tokenized and reversible', () => {
  const session = createRedactionSession();
  const text = 'PESEL 12345678901, tel 501 234 567';
  const redacted = session.redact(text);
  assert.match(redacted, /\[PESEL_1\]/);
  assert.match(redacted, /\[TELEFON_1\]/);
  assert.equal(session.restore(redacted), text);
});

test('restorePii leaves text untouched when the map is empty', () => {
  assert.equal(restorePii('brak tokenow tutaj', {}), 'brak tokenow tutaj');
  assert.equal(restorePii('brak tokenow tutaj', null), 'brak tokenow tutaj');
});

test('createDetokenizingChunker reassembles a token split across streaming chunks', () => {
  const map = { '[EMAIL_1]': 'jan@example.com' };
  const out = [];
  const chunker = createDetokenizingChunker(map, (chunk) => out.push(chunk));
  chunker.push('Kontakt: [EM');
  chunker.push('AIL_1] dzięki');
  chunker.flush();
  assert.equal(out.join(''), 'Kontakt: jan@example.com dzięki');
});

test('createDetokenizingChunker picks up a token added to the map AFTER creation', () => {
  // Mirrors streamChatTurn: the chunker is built from prep.session.map before
  // the tool loop runs, so a token discovered mid-stream (from a BigQuery
  // result) must still be honored on later pushes.
  const map = {};
  const out = [];
  const chunker = createDetokenizingChunker(map, (chunk) => out.push(chunk));
  chunker.push('Zanim wiemy cokolwiek: ');
  map['[KLIENT_1]'] = 'Fikcyjny Klient Sp. z o.o.';
  chunker.push('Budżet klienta [KLIENT_1] to 50000 zł.');
  chunker.flush();
  assert.equal(out.join(''), 'Zanim wiemy cokolwiek: Budżet klienta Fikcyjny Klient Sp. z o.o. to 50000 zł.');
});
