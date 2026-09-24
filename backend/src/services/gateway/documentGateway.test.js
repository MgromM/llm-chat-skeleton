import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mocked BEFORE importing the module under test, same reasoning as
// sensitiveDataPrecheck.test.js: `classifyContent` (called via
// sensitiveDataPrecheck.js) hits the real Anthropic client. `getRedactionTerms`
// is mocked directly (not via db.js) because it caches its result in-process
// for 30s — mocking the DB layer underneath it would make cache hits/misses
// depend on test execution order. `ocrExtraction.js` is mocked so the
// image-attachment path doesn't spin up a real Tesseract worker.
const redactionTermsMock = mock.module('../security/redactionTerms.js', {
  exports: { getRedactionTerms: mock.fn() },
});
const anthropicMock = mock.module('../anthropicClient.js', { exports: { getAnthropicClient: mock.fn() } });
const ocrMock = mock.module('../security/ocrExtraction.js', { exports: { extractTextFromImages: mock.fn() } });

const { getRedactionTerms } = await import('../security/redactionTerms.js');
const { getAnthropicClient } = await import('../anthropicClient.js');
const { extractTextFromImages } = await import('../security/ocrExtraction.js');
const { checkDocument } = await import('./documentGateway.js');

function haikuVerdict({ level = 'ZIELONA', category = 'BRAK', confidence = 0.9, rationale = 'ok' } = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ level, category, confidence, rationale }) }],
  };
}

test.beforeEach(() => {
  getRedactionTerms.mock.resetCalls();
  getRedactionTerms.mock.mockImplementation(async () => []);
  getAnthropicClient.mock.resetCalls();
  getAnthropicClient.mock.mockImplementation(async () => ({
    messages: { create: mock.fn(async () => haikuVerdict()) },
  }));
  extractTextFromImages.mock.resetCalls();
  extractTextFromImages.mock.mockImplementation(async () => '');
});

test('a plain-text document containing a PESEL is redacted before classification, and the verdict is returned', async () => {
  const create = mock.fn(async () => haikuVerdict({ level: 'CZERWONA', category: 'PII', confidence: 0.95 }));
  getAnthropicClient.mock.mockImplementation(async () => ({ messages: { create } }));

  const buffer = Buffer.from('Dane klienta: PESEL 44051401359, kontakt jan@przyklad.pl');
  const result = await checkDocument({ buffer, filename: 'notatka.txt', mimeType: 'text/plain' });

  assert.equal(result.level, 'czerwona');
  assert.equal(result.category, 'PII');
  assert.ok(result.piiCategories.includes('PESEL'));
  assert.ok(result.piiCategories.includes('EMAIL'));
  // The redacted text sent to the classifier must not contain the raw PESEL.
  assert.doesNotMatch(result.redactedText, /44051401359/);
  assert.match(result.redactedText, /\[PESEL_1\]/);

  // The classifier must have been called with the REDACTED text, not the raw one.
  const classifyArg = create.mock.calls[0].arguments[0].messages[0].content;
  assert.doesNotMatch(classifyArg, /44051401359/);
});

test('a neutral document is classified zielona and passes through unredacted', async () => {
  const buffer = Buffer.from('Ogólne pytanie o strategię social media dla branży FMCG.');
  const result = await checkDocument({ buffer, filename: 'brief.txt', mimeType: 'text/plain' });

  assert.equal(result.level, 'zielona');
  assert.deepEqual(result.piiCategories, []);
});

test('an image attachment goes through OCR before classification', async () => {
  extractTextFromImages.mock.mockImplementation(async () => 'Tekst z obrazka: budżet kampanii 5000 zł.');
  const buffer = Buffer.from('fake-png-bytes');

  const result = await checkDocument({ buffer, filename: 'zrzut.png', mimeType: 'image/png' });

  assert.equal(extractTextFromImages.mock.callCount(), 1);
  assert.equal(result.level, 'zielona');
});

test('a failed OCR read fails CLOSED — BŁĄD, not a silent PUSTY', async () => {
  extractTextFromImages.mock.mockImplementation(async (images, { onFailure } = {}) => {
    onFailure?.(images[0], new Error('Tesseract worker crashed'));
    return '';
  });
  const buffer = Buffer.from('fake-corrupt-png-bytes');

  const result = await checkDocument({ buffer, filename: 'uszkodzony.png', mimeType: 'image/png' });

  assert.equal(result.level, 'BŁĄD');
  assert.notEqual(result.level, 'PUSTY');
  assert.match(result.error, /Tesseract worker crashed/);
  assert.equal(getAnthropicClient.mock.callCount(), 0);
});

test('an unsupported mime type returns NIEOBSŁUGIWANY without calling the classifier', async () => {
  const buffer = Buffer.from('whatever');
  const result = await checkDocument({ buffer, filename: 'archiwum.zip', mimeType: 'application/zip' });

  assert.equal(result.level, 'NIEOBSŁUGIWANY');
  assert.equal(getAnthropicClient.mock.callCount(), 0);
});

test('an empty (or whitespace-only) document is reported as PUSTY without calling the classifier', async () => {
  const buffer = Buffer.from('   \n\t  ');
  const result = await checkDocument({ buffer, filename: 'pusty.txt', mimeType: 'text/plain' });

  assert.equal(result.level, 'PUSTY');
  assert.equal(getAnthropicClient.mock.callCount(), 0);
  assert.equal(getRedactionTerms.mock.callCount(), 0);
});

test('a document longer than DOCUMENT_GATEWAY_MAX_CHARS is truncated before classification', async () => {
  const create = mock.fn(async () => haikuVerdict());
  getAnthropicClient.mock.mockImplementation(async () => ({ messages: { create } }));

  // Default limit is 20_000 chars (see .env.example) unless overridden in this env.
  const limit = Number(process.env.DOCUMENT_GATEWAY_MAX_CHARS ?? 20_000);
  const buffer = Buffer.from('x'.repeat(limit + 500));

  const result = await checkDocument({ buffer, filename: 'ogromny.txt', mimeType: 'text/plain' });

  assert.equal(result.truncated, true);
  assert.equal(result.charCount, limit);
  const classifyArg = create.mock.calls[0].arguments[0].messages[0].content;
  assert.equal(classifyArg.length, limit);
});

test('a classifier failure fails CLOSED — level is BŁĄD, never a silent zielona', async () => {
  getAnthropicClient.mock.mockImplementation(async () => ({
    messages: { create: mock.fn(async () => { throw new Error('Anthropic API unreachable'); }) },
  }));
  const buffer = Buffer.from('treść dokumentu');

  const result = await checkDocument({ buffer, filename: 'plik.txt', mimeType: 'text/plain' });

  assert.equal(result.level, 'BŁĄD');
  assert.notEqual(result.level, 'zielona');
  assert.match(result.error, /Anthropic API unreachable/);
});

test('a redaction-terms lookup failure fails CLOSED — level is BŁĄD, classifier is never called with unredacted text', async () => {
  getRedactionTerms.mock.mockImplementation(async () => { throw new Error('connection refused'); });
  const buffer = Buffer.from('Dane klienta: PESEL 44051401359');

  const result = await checkDocument({ buffer, filename: 'plik.txt', mimeType: 'text/plain' });

  assert.equal(result.level, 'BŁĄD');
  assert.match(result.error, /connection refused/);
  assert.equal(getAnthropicClient.mock.callCount(), 0);
});

test.after(() => {
  redactionTermsMock.restore();
  anthropicMock.restore();
  ocrMock.restore();
});
