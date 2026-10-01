import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mocked BEFORE importing the module under test so its top-level imports
// resolve to these stand-ins instead of hitting Postgres or the real
// Ollama server.
const dbMock = mock.module('../../config/db.js', {
  exports: { query: mock.fn() },
});
const ollamaMock = mock.module('../ollamaClient.js', {
  exports: { completeText: mock.fn(), OLLAMA_MODEL: 'llama3.1' },
});

const { query } = await import('../../config/db.js');
const { completeText } = await import('../ollamaClient.js');
const { precheckMessage } = await import('./sensitiveDataPrecheck.js');

function verdictText({ level = 'ZIELONA', category = 'BRAK', confidence = 0.9, rationale = 'ok' } = {}) {
  return { text: JSON.stringify({ level, category, confidence, rationale }) };
}

// Query call #0 is always the ai_consent lookup (conversations JOIN clients);
// call #1 is the INSERT into precheck_results. mockImplementationOnce needs
// an explicit call index — queuing two in a row without one both target
// call #0 and the second silently wins, so the indices below matter.
function mockConsent(rows) {
  query.mock.mockImplementationOnce(async () => ({ rows }), 0);
}

function mockPersistOk() {
  query.mock.mockImplementationOnce(async () => ({ rows: [] }), 1);
}

test.beforeEach(() => {
  query.mock.resetCalls();
  query.mock.mockImplementation(async () => ({ rows: [] }));
  completeText.mock.resetCalls();
  completeText.mock.mockImplementation(async () => verdictText());
});

test('client with ai_consent = false is hard-blocked as NO_CONSENT without calling the model', async () => {
  mockConsent([{ ai_consent: false }]);
  mockPersistOk();

  const result = await precheckMessage({ conversationId: 1, userMessage: 'cokolwiek' });

  assert.equal(result.blocked, true);
  assert.equal(result.category, 'NO_CONSENT');
  assert.equal(completeText.mock.callCount(), 0);

  // Persisted with blocked=true, needs_review=false.
  const insertCall = query.mock.calls[1];
  assert.match(insertCall.arguments[0], /INSERT INTO precheck_results/);
  const [, blocked, category, , , , level, needsReview] = insertCall.arguments[1];
  assert.equal(blocked, true);
  assert.equal(category, 'NO_CONSENT');
  assert.equal(level, 'czerwona');
  assert.equal(needsReview, false);
});

test('client with ai_consent = true proceeds to the model content check', async () => {
  mockConsent([{ ai_consent: true }]);
  mockPersistOk();
  completeText.mock.mockImplementation(async () => verdictText({ level: 'ZIELONA' }));

  const result = await precheckMessage({ conversationId: 2, userMessage: 'ogólne pytanie' });

  assert.equal(completeText.mock.callCount(), 1);
  assert.equal(result.blocked, false);
  assert.equal(result.level, 'zielona');
});

test('conversation with no linked client (no client_id) skips the consent check', async () => {
  mockConsent([]); // JOIN finds no row when conversations.client_id IS NULL
  mockPersistOk();

  const result = await precheckMessage({ conversationId: 3, userMessage: 'ogólne pytanie' });

  assert.equal(result.blocked, false);
  assert.equal(completeText.mock.callCount(), 1);
});

test('a failing consent lookup fails open and still runs the content pre-check', async () => {
  query.mock.mockImplementationOnce(async () => {
    throw new Error('connection refused');
  }, 0);
  mockPersistOk();

  const result = await precheckMessage({ conversationId: 4, userMessage: 'ogólne pytanie' });

  assert.equal(result.blocked, false);
  assert.equal(completeText.mock.callCount(), 1);
});

test('żółta/czerwona verdict at or above the confidence threshold is hard-blocked', async () => {
  mockConsent([]);
  mockPersistOk();
  completeText.mock.mockImplementation(async () => verdictText({ level: 'CZERWONA', category: 'PII', confidence: 0.9 }));

  const result = await precheckMessage({ conversationId: 5, userMessage: 'dane osobowe klienta' });

  assert.equal(result.blocked, true);
  assert.equal(result.needsReview, false);

  const insertCall = query.mock.calls[1];
  const [, blocked, , , , , , needsReview] = insertCall.arguments[1];
  assert.equal(blocked, true);
  assert.equal(needsReview, false);
});

test('żółta/czerwona verdict BELOW the confidence threshold is flagged for review, not blocked', async () => {
  mockConsent([]);
  mockPersistOk();
  completeText.mock.mockImplementation(async () => verdictText({ level: 'ZOLTA', category: 'DANE_FIRMOWE', confidence: 0.3 }));

  const result = await precheckMessage({ conversationId: 6, userMessage: 'niejasna wzmianka' });

  assert.equal(result.blocked, false);
  assert.equal(result.needsReview, true);

  const insertCall = query.mock.calls[1];
  const [, blocked, , , , , , needsReview] = insertCall.arguments[1];
  assert.equal(blocked, false);
  assert.equal(needsReview, true);
});

test('żółta/czerwona verdict with missing/unparseable confidence is flagged for review, not blocked', async () => {
  mockConsent([]);
  mockPersistOk();
  completeText.mock.mockImplementation(async () => ({
    text: JSON.stringify({ level: 'ZOLTA', category: 'PII', rationale: 'brak confidence' }),
  }));

  const result = await precheckMessage({ conversationId: 7, userMessage: 'coś' });

  assert.equal(result.blocked, false);
  assert.equal(result.needsReview, true);
});

test('zielona verdict is never flagged for review regardless of confidence', async () => {
  mockConsent([]);
  mockPersistOk();
  completeText.mock.mockImplementation(async () => verdictText({ level: 'ZIELONA', confidence: 0.1 }));

  const result = await precheckMessage({ conversationId: 8, userMessage: 'pytanie ogólne' });

  assert.equal(result.blocked, false);
  assert.equal(result.needsReview, false);
});

test.after(() => {
  dbMock.restore();
  ollamaMock.restore();
});
