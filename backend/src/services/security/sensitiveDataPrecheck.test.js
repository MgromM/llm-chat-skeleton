import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mocked BEFORE importing the module under test so its top-level imports
// resolve to these stand-ins instead of hitting Postgres or the real
// Anthropic API.
const dbMock = mock.module('../../config/db.js', {
  exports: { query: mock.fn() },
});
const anthropicMock = mock.module('../anthropicClient.js', {
  exports: { getAnthropicClient: mock.fn() },
});

const { query } = await import('../../config/db.js');
const { getAnthropicClient } = await import('../anthropicClient.js');
const { precheckMessage } = await import('./sensitiveDataPrecheck.js');

function haikuVerdict({ level = 'ZIELONA', category = 'BRAK', confidence = 0.9, rationale = 'ok' } = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ level, category, confidence, rationale }) }],
  };
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
  getAnthropicClient.mock.resetCalls();
  getAnthropicClient.mock.mockImplementation(async () => ({
    messages: { create: mock.fn(async () => haikuVerdict()) },
  }));
});

test('client with ai_consent = false is hard-blocked as NO_CONSENT without calling Haiku', async () => {
  mockConsent([{ ai_consent: false }]);
  mockPersistOk();

  const result = await precheckMessage({ conversationId: 1, userMessage: 'cokolwiek' });

  assert.equal(result.blocked, true);
  assert.equal(result.category, 'NO_CONSENT');
  assert.equal(getAnthropicClient.mock.callCount(), 0);

  // Persisted with blocked=true, needs_review=false.
  const insertCall = query.mock.calls[1];
  assert.match(insertCall.arguments[0], /INSERT INTO precheck_results/);
  const [, blocked, category, , , , level, needsReview] = insertCall.arguments[1];
  assert.equal(blocked, true);
  assert.equal(category, 'NO_CONSENT');
  assert.equal(level, 'czerwona');
  assert.equal(needsReview, false);
});

test('client with ai_consent = true proceeds to the Haiku content check', async () => {
  mockConsent([{ ai_consent: true }]);
  mockPersistOk();
  const create = mock.fn(async () => haikuVerdict({ level: 'ZIELONA' }));
  getAnthropicClient.mock.mockImplementation(async () => ({ messages: { create } }));

  const result = await precheckMessage({ conversationId: 2, userMessage: 'ogólne pytanie' });

  assert.equal(create.mock.callCount(), 1);
  assert.equal(result.blocked, false);
  assert.equal(result.level, 'zielona');
});

test('conversation with no linked client (no client_id) skips the consent check', async () => {
  mockConsent([]); // JOIN finds no row when conversations.client_id IS NULL
  mockPersistOk();

  const result = await precheckMessage({ conversationId: 3, userMessage: 'ogólne pytanie' });

  assert.equal(result.blocked, false);
  assert.equal(getAnthropicClient.mock.callCount(), 1);
});

test('a failing consent lookup fails open and still runs the content pre-check', async () => {
  query.mock.mockImplementationOnce(async () => {
    throw new Error('connection refused');
  }, 0);
  mockPersistOk();

  const result = await precheckMessage({ conversationId: 4, userMessage: 'ogólne pytanie' });

  assert.equal(result.blocked, false);
  assert.equal(getAnthropicClient.mock.callCount(), 1);
});

test('żółta/czerwona verdict at or above the confidence threshold is hard-blocked', async () => {
  mockConsent([]);
  mockPersistOk();
  const create = mock.fn(async () => haikuVerdict({ level: 'CZERWONA', category: 'PII', confidence: 0.9 }));
  getAnthropicClient.mock.mockImplementation(async () => ({ messages: { create } }));

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
  const create = mock.fn(async () => haikuVerdict({ level: 'ZOLTA', category: 'DANE_FIRMOWE', confidence: 0.3 }));
  getAnthropicClient.mock.mockImplementation(async () => ({ messages: { create } }));

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
  const create = mock.fn(async () => ({
    content: [{ type: 'text', text: JSON.stringify({ level: 'ZOLTA', category: 'PII', rationale: 'brak confidence' }) }],
  }));
  getAnthropicClient.mock.mockImplementation(async () => ({ messages: { create } }));

  const result = await precheckMessage({ conversationId: 7, userMessage: 'coś' });

  assert.equal(result.blocked, false);
  assert.equal(result.needsReview, true);
});

test('zielona verdict is never flagged for review regardless of confidence', async () => {
  mockConsent([]);
  mockPersistOk();
  const create = mock.fn(async () => haikuVerdict({ level: 'ZIELONA', confidence: 0.1 }));
  getAnthropicClient.mock.mockImplementation(async () => ({ messages: { create } }));

  const result = await precheckMessage({ conversationId: 8, userMessage: 'pytanie ogólne' });

  assert.equal(result.blocked, false);
  assert.equal(result.needsReview, false);
});

test.after(() => {
  dbMock.restore();
  anthropicMock.restore();
});
