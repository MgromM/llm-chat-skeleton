import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mocked BEFORE importing the module under test so its top-level import
// resolves to this stand-in instead of hitting Postgres -- same approach as
// sensitiveDataPrecheck.test.js.
const dbMock = mock.module('../../config/db.js', {
  exports: { query: mock.fn() },
});

const { query } = await import('../../config/db.js');
const { createReviewItem } = await import('./reviewItemsService.js');

test.beforeEach(() => {
  query.mock.resetCalls();
});

test('createReviewItem inserts the row and returns the new id', async () => {
  query.mock.mockImplementationOnce(async () => ({ rows: [{ id: 42 }] }));

  const id = await createReviewItem({
    itemType: 'canteen_catalog',
    title: 'Nowe danie tygodnia',
    rationale: 'Nowa pozycja w jadłospisie wymaga potwierdzenia alergenów',
    sourceLabel: 'Kantyna — jadłospis',
  });

  assert.equal(id, 42);
  assert.equal(query.mock.callCount(), 1);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.match(sql, /INSERT INTO review_items/);
  assert.match(sql, /ON CONFLICT \(item_type, external_ref\) WHERE external_ref IS NOT NULL DO NOTHING/);
  assert.deepEqual(params, [
    'canteen_catalog',
    'Nowe danie tygodnia',
    'Nowa pozycja w jadłospisie wymaga potwierdzenia alergenów',
    'Kantyna — jadłospis',
    null, // sourceUrl
    null, // sourceRef
    null, // externalRef
    null, // confidence
  ]);
});

test('passes sourceUrl, externalRef and confidence straight through when provided', async () => {
  query.mock.mockImplementationOnce(async () => ({ rows: [{ id: 7 }] }));

  await createReviewItem({
    itemType: 'email_complaint',
    title: 'Reklamacja klienta',
    rationale: 'Klient zgłosił problem z dostawą',
    sourceLabel: 'support@firma.pl',
    sourceUrl: 'https://mail.example.com/msg/123',
    externalRef: 'msg-123',
    confidence: 0.8,
  });

  const [, params] = query.mock.calls[0].arguments;
  assert.equal(params[4], 'https://mail.example.com/msg/123');
  assert.equal(params[6], 'msg-123');
  assert.equal(params[7], 0.8);
});

test('sourceRef is JSON-stringified before being passed to query, matching the citations/generated_files convention in chatCore/pipeline.js', async () => {
  query.mock.mockImplementationOnce(async () => ({ rows: [{ id: 8 }] }));

  await createReviewItem({
    itemType: 'canteen_catalog',
    title: 'Danie',
    rationale: 'Uzasadnienie',
    sourceLabel: 'Źródło',
    sourceRef: { week: 42, day: 'poniedziałek' },
  });

  const [, params] = query.mock.calls[0].arguments;
  assert.equal(params[5], JSON.stringify({ week: 42, day: 'poniedziałek' }));
});

test('a duplicate (item_type, external_ref) resolves to no rows and the function returns null', async () => {
  query.mock.mockImplementationOnce(async () => ({ rows: [] }));

  const id = await createReviewItem({
    itemType: 'email_complaint',
    title: 'Reklamacja klienta',
    rationale: 'Już zgłoszona wcześniej',
    sourceLabel: 'support@firma.pl',
    externalRef: 'msg-123',
  });

  assert.equal(id, null);
});

test('a failing query is caught and swallowed, never thrown -- same fire-and-forget contract as detectUncertainLeak', async () => {
  query.mock.mockImplementationOnce(async () => {
    throw new Error('connection refused');
  });

  const id = await createReviewItem({
    itemType: 'canteen_catalog',
    title: 'Danie',
    rationale: 'Uzasadnienie',
    sourceLabel: 'Źródło',
  });

  assert.equal(id, null);
});

test.after(() => {
  dbMock.restore();
});
