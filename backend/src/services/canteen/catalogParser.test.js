import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mocked BEFORE importing the module under test, same reasoning as
// documentGateway.test.js: completeText hits the real Ollama server.
const ollamaMock = mock.module('../ollamaClient.js', { exports: { completeText: mock.fn(), OLLAMA_MODEL: 'llama3.1' } });
const { completeText } = await import('../ollamaClient.js');
const { parseCatalogText } = await import('./catalogParser.js');

test.beforeEach(() => {
  completeText.mock.resetCalls();
  completeText.mock.mockImplementation(async () => ({ text: JSON.stringify({ isProduct: false }) }));
});

test('parses "Nazwa  12,50 zł" style lines via regex, without calling Ollama', async () => {
  const { items, linesTotal, linesParsed } = await parseCatalogText('Kawa rozpuszczalna 12,50 zł\nHerbata czarna 5,00 zł');

  assert.equal(linesTotal, 2);
  assert.equal(linesParsed, 2);
  assert.deepEqual(items, [
    { name: 'Kawa rozpuszczalna', price: 12.5, unit: null },
    { name: 'Herbata czarna', price: 5, unit: null },
  ]);
  assert.equal(completeText.mock.callCount(), 0);
});

test('accepts a dot decimal separator, no currency suffix, and a unit suffix', async () => {
  const { items } = await parseCatalogText('Cukier 4.00\nMleko 3,50 zł/szt');

  assert.deepEqual(items, [
    { name: 'Cukier', price: 4, unit: null },
    { name: 'Mleko', price: 3.5, unit: 'szt' },
  ]);
});

test('ignores blank lines without counting them toward linesTotal', async () => {
  const { linesTotal, linesParsed } = await parseCatalogText('Kawa 12,50 zł\n\n   \nHerbata 5,00 zł');

  assert.equal(linesTotal, 2);
  assert.equal(linesParsed, 2);
});

test('a line the regex cannot parse falls back to Ollama, one call per line', async () => {
  completeText.mock.mockImplementation(async () =>
    ({ text: JSON.stringify({ isProduct: true, name: 'Zupa dnia', price: 7.5, unit: null }) }));

  const { items, linesParsed } = await parseCatalogText('Zupa dnia - pytaj o cenę w okienku');

  assert.equal(completeText.mock.callCount(), 1);
  assert.equal(linesParsed, 1);
  assert.deepEqual(items, [{ name: 'Zupa dnia', price: 7.5, unit: null }]);
});

test('a fallback verdict of isProduct:false drops the line entirely', async () => {
  completeText.mock.mockImplementation(async () => ({ text: JSON.stringify({ isProduct: false }) }));

  const { items, linesTotal, linesParsed } = await parseCatalogText('--- Cennik na tydzień 42 ---');

  assert.equal(linesTotal, 1);
  assert.equal(linesParsed, 0);
  assert.deepEqual(items, []);
});

test('a fallback call that throws is treated as unparsed, not a crash', async () => {
  completeText.mock.mockImplementation(async () => {
    throw new Error('Ollama server unreachable');
  });

  const { items, linesParsed } = await parseCatalogText('coś nieczytelnego');

  assert.equal(linesParsed, 0);
  assert.deepEqual(items, []);
});

test('stops attempting the Ollama fallback past CANTEEN_PARSER_MAX_FALLBACK_LINES, skipping the rest (still counted in linesTotal)', async () => {
  completeText.mock.mockImplementation(async () => ({ text: JSON.stringify({ isProduct: false }) }));
  const maxFallback = Number(process.env.CANTEEN_PARSER_MAX_FALLBACK_LINES ?? 80);
  const lineCount = maxFallback + 5;
  const text = Array.from({ length: lineCount }, (_, i) => `linia bez ceny ${i}`).join('\n');

  const { linesTotal, linesParsed } = await parseCatalogText(text);

  assert.equal(linesTotal, lineCount);
  assert.equal(linesParsed, 0);
  assert.equal(completeText.mock.callCount(), maxFallback);
});

test.after(() => {
  ollamaMock.restore();
});
