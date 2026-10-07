import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mocked BEFORE importing the module under test, same approach as
// documentGateway.test.js. confidence.js is NOT mocked -- it's pure/
// deterministic (no I/O) and has its own dedicated test file, so letting it
// run for real here exercises the actual wiring between extraction,
// parsing, confidence, and the review queue. catalogParser.js also runs for
// real (own test file too), but IT calls out to ollamaClient.js for its
// per-line fallback on anything the regex can't read -- that one dependency
// has to be mocked here too, or an unparseable test line would trigger a
// real network call to a local Ollama server. There is no OCR mock here at
// all: this backend never runs OCR itself for canteen catalogs (an external
// service does, and calls ingestCanteenOcrText's own route with already-
// extracted text) -- see the "OCR webhook" tests below.
const textExtractionMock = mock.module('../knowledge/textExtraction.js', {
  exports: { extractText: mock.fn(), SUPPORTED_KNOWLEDGE_MIME_TYPES: new Set(['text/plain', 'application/pdf']) },
});
const ollamaMock = mock.module('../ollamaClient.js', { exports: { completeText: mock.fn(), OLLAMA_MODEL: 'llama3.1' } });
const dbMock = mock.module('../../config/db.js', { exports: { query: mock.fn() } });
const diffMock = mock.module('./catalogDiff.js', { exports: { diffAndApplyCatalog: mock.fn() } });
const reviewQueueMock = mock.module('../reviewQueue/reviewItemsService.js', { exports: { createReviewItem: mock.fn() } });

const { extractText } = await import('../knowledge/textExtraction.js');
const { completeText } = await import('../ollamaClient.js');
const { query } = await import('../../config/db.js');
const { diffAndApplyCatalog } = await import('./catalogDiff.js');
const { createReviewItem } = await import('../reviewQueue/reviewItemsService.js');
const { ingestCanteenDocument, ingestCanteenOcrText } = await import('./canteenIngestion.js');

// Every regex-parseable catalog line, so parseCatalogText (real) recognizes
// 100% of lines without needing any Ollama fallback.
const CLEAN_CATALOG_TEXT = 'Kawa rozpuszczalna 12,50 zł\nHerbata czarna 5,00 zł\nCukier 4,00 zł';

test.beforeEach(() => {
  extractText.mock.resetCalls();
  extractText.mock.mockImplementation(async () => CLEAN_CATALOG_TEXT);
  completeText.mock.resetCalls();
  // Default: every fallback-attempted line is judged "not a product", so an
  // unparseable line correctly fails to parse without ever needing a real
  // Ollama server.
  completeText.mock.mockImplementation(async () => ({ text: JSON.stringify({ isProduct: false }) }));
  query.mock.resetCalls();
  query.mock.mockImplementation(async () => ({ rows: [{ id: 555 }] }));
  diffAndApplyCatalog.mock.resetCalls();
  diffAndApplyCatalog.mock.mockImplementation(async () => []);
  createReviewItem.mock.resetCalls();
  createReviewItem.mock.mockImplementation(async () => 1);
});

test('an unsupported mime type fails without calling the parser or the diff', async () => {
  const result = await ingestCanteenDocument({
    facilityId: 1,
    buffer: Buffer.from('whatever'),
    filename: 'zdjecie.png',
    mimeType: 'image/png',
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /Nieobsługiwany typ pliku/);
  assert.equal(extractText.mock.callCount(), 0);
  assert.equal(diffAndApplyCatalog.mock.callCount(), 0);
});

test('a text-extraction failure is reported as a failed run, not thrown', async () => {
  extractText.mock.mockImplementation(async () => {
    throw new Error('plik uszkodzony');
  });

  const result = await ingestCanteenDocument({
    facilityId: 1,
    buffer: Buffer.from('x'),
    filename: 'cennik.pdf',
    mimeType: 'application/pdf',
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /plik uszkodzony/);
});

test('an empty document is reported as a failed run', async () => {
  extractText.mock.mockImplementation(async () => '   \n\t');

  const result = await ingestCanteenDocument({
    facilityId: 1,
    buffer: Buffer.from('x'),
    filename: 'pusty.txt',
    mimeType: 'text/plain',
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /pusty/i);
});

test('a document with no recognizable product lines fails without ever calling the diff', async () => {
  extractText.mock.mockImplementation(async () => 'to nie jest cennik\nani to');

  const result = await ingestCanteenDocument({
    facilityId: 1,
    buffer: Buffer.from('x'),
    filename: 'notatka.txt',
    mimeType: 'text/plain',
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /Nie rozpoznano żadnej pozycji/);
  assert.equal(diffAndApplyCatalog.mock.callCount(), 0);
});

test('a cleanly parsed structured-file catalog with no flagged changes is status "ok" and raises no review item', async () => {
  const result = await ingestCanteenDocument({
    facilityId: 1,
    buffer: Buffer.from('x'),
    filename: 'cennik.pdf',
    mimeType: 'application/pdf',
    submittedBy: 7,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.linesParsed, 3);
  assert.equal(result.linesTotal, 3);
  assert.equal(diffAndApplyCatalog.mock.callCount(), 1);
  assert.equal(createReviewItem.mock.callCount(), 0);
});

test('a flagged change from the diff raises one review item for the run plus one per flagged change', async () => {
  diffAndApplyCatalog.mock.mockImplementation(async () => [
    { id: 11, type: 'price_changed', normalizedName: 'kawa', flagged: true, flagReason: 'Podejrzany skok ceny: 3 zł → 35 zł', applied: false },
    { id: 12, type: 'added', normalizedName: 'herbata', flagged: false, flagReason: null, applied: true },
  ]);

  const result = await ingestCanteenDocument({
    facilityId: 1,
    buffer: Buffer.from('x'),
    filename: 'cennik.pdf',
    mimeType: 'application/pdf',
  });

  assert.equal(result.status, 'partial');
  // One for the run, one for the single flagged change -- the unflagged "added" change raises nothing.
  assert.equal(createReviewItem.mock.callCount(), 2);
  const externalRefs = createReviewItem.mock.calls.map((c) => c.arguments[0].externalRef);
  assert.deepEqual(externalRefs.sort(), ['canteen_change:11', 'canteen_run:555'].sort());
});

test('a diff failure is reported as a failed run and persists the failure on the extraction_runs row', async () => {
  diffAndApplyCatalog.mock.mockImplementation(async () => {
    throw new Error('deadlock detected');
  });

  const result = await ingestCanteenDocument({
    facilityId: 1,
    buffer: Buffer.from('x'),
    filename: 'cennik.pdf',
    mimeType: 'application/pdf',
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /deadlock detected/);
  const updateCall = query.mock.calls.find((c) => /UPDATE canteen_extraction_runs SET status = 'failed'/.test(c.arguments[0]));
  assert.ok(updateCall, 'expected the run row to be marked failed');
});

// --- OCR webhook path (ingestCanteenOcrText): no file, no mimetype
// branching, no OCR run by this backend -- text (and the external engine's
// own confidence) arrive already extracted. ---

test('ingestCanteenOcrText parses externally-provided text directly, no file/mimetype involved', async () => {
  const result = await ingestCanteenOcrText({ facilityId: 3, text: CLEAN_CATALOG_TEXT, confidence: 92 });

  assert.equal(extractText.mock.callCount(), 0);
  assert.equal(result.status, 'ok');
  assert.equal(result.linesParsed, 3);
  // 0.4 * 0.92 + 0.6 * 1.0 = 0.968
  assert.ok(Math.abs(result.confidence - 0.968) < 1e-9);
});

test('ingestCanteenOcrText with no confidence supplied falls back to parse rate alone', async () => {
  const result = await ingestCanteenOcrText({ facilityId: 3, text: CLEAN_CATALOG_TEXT });

  assert.equal(result.status, 'ok');
  assert.ok(Math.abs(result.confidence - 1.0) < 1e-9);
});

test('ingestCanteenOcrText flags a low-confidence external OCR read into the review queue', async () => {
  const text = `Kawa 12,50 zł\n${'linia bez ceny\n'.repeat(9)}`;
  const result = await ingestCanteenOcrText({ facilityId: 2, text, confidence: 40 });

  assert.equal(result.status, 'partial');
  assert.equal(createReviewItem.mock.callCount(), 1);
  const [arg] = createReviewItem.mock.calls[0].arguments;
  assert.equal(arg.itemType, 'canteen_catalog');
  assert.equal(arg.externalRef, 'canteen_run:555');
});

test('ingestCanteenOcrText with empty text fails without calling the parser', async () => {
  const result = await ingestCanteenOcrText({ facilityId: 1, text: '   ' });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /pusty/i);
  assert.equal(diffAndApplyCatalog.mock.callCount(), 0);
});

test.after(() => {
  textExtractionMock.restore();
  ollamaMock.restore();
  dbMock.restore();
  diffMock.restore();
  reviewQueueMock.restore();
});
