import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mocked BEFORE importing the module under test, same approach as
// reviewItemsService.test.js. No existing precedent in this codebase for a
// pool.connect()-based transaction (every other service goes through the
// simpler config/db.js `query()` helper) -- this fake client is a minimal
// stand-in for the handful of query shapes diffAndApplyCatalog/
// applyPendingChange actually issue, matched by SQL prefix rather than exact
// strings, so it stays robust to harmless rewording of the real queries.
const dbMock = mock.module('../../config/db.js', { exports: { pool: { connect: mock.fn() } } });
const { pool } = await import('../../config/db.js');
const { diffAndApplyCatalog, applyPendingChange } = await import('./catalogDiff.js');

function makeFakeClient({ existingProducts = [], changeRow = null, onQuery } = {}) {
  const calls = [];
  let nextChangeId = 100;
  const client = {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: s, params });
      onQuery?.(s);
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s)) return { rows: [] };
      if (s.startsWith('SELECT id, normalized_name, price, active FROM canteen_products')) return { rows: existingProducts };
      if (s.startsWith('INSERT INTO canteen_catalog_changes')) return { rows: [{ id: nextChangeId++ }] };
      if (s.startsWith('INSERT INTO canteen_products')) return { rows: [] };
      if (s.startsWith('UPDATE canteen_products')) return { rows: [] };
      if (s.startsWith('SELECT * FROM canteen_catalog_changes')) return { rows: changeRow ? [changeRow] : [] };
      if (s.startsWith('UPDATE canteen_catalog_changes')) return { rows: [] };
      throw new Error(`Unexpected query in fake client: ${s}`);
    },
    release: mock.fn(),
  };
  return { client, calls };
}

/** Wires pool.connect() to return a fresh fake client for this test, and returns its recorded calls array. */
function useFakeClient(opts) {
  const { client, calls } = makeFakeClient(opts);
  pool.connect.mock.mockImplementation(async () => client);
  return calls;
}

function findCalls(calls, prefix) {
  return calls.filter((c) => c.sql.startsWith(prefix));
}

test.beforeEach(() => {
  pool.connect.mock.resetCalls();
});

test('a brand-new product is recorded as "added" and applied immediately', async () => {
  const calls = useFakeClient({ existingProducts: [] });

  const result = await diffAndApplyCatalog({
    facilityId: 1,
    extractionRunId: 10,
    parsedItems: [{ name: 'Kawa', price: 12.5, unit: null }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'added');
  assert.equal(result[0].applied, true);
  assert.equal(result[0].flagged, false);
  assert.equal(findCalls(calls, 'INSERT INTO canteen_products').length, 1);
  assert.equal(findCalls(calls, 'COMMIT').length, 1);
  assert.equal(findCalls(calls, 'ROLLBACK').length, 0);
});

test('an ordinary price change is applied immediately, not flagged', async () => {
  const calls = useFakeClient({ existingProducts: [{ id: 5, normalized_name: 'kawa', price: '10.00', active: true }] });

  const result = await diffAndApplyCatalog({
    facilityId: 1,
    extractionRunId: 10,
    parsedItems: [{ name: 'Kawa', price: 11.0, unit: null }],
  });

  assert.equal(result[0].type, 'price_changed');
  assert.equal(result[0].flagged, false);
  assert.equal(result[0].applied, true);
  assert.equal(findCalls(calls, 'INSERT INTO canteen_products').length, 1);
});

test('an implausible price jump is logged but held back (applied=false), product untouched', async () => {
  const calls = useFakeClient({ existingProducts: [{ id: 5, normalized_name: 'kawa', price: '3.00', active: true }] });

  const result = await diffAndApplyCatalog({
    facilityId: 1,
    extractionRunId: 10,
    parsedItems: [{ name: 'Kawa', price: 35.0, unit: null }],
  });

  assert.equal(result[0].type, 'price_changed');
  assert.equal(result[0].flagged, true);
  assert.equal(result[0].applied, false);
  assert.match(result[0].flagReason, /skok ceny/i);
  assert.equal(findCalls(calls, 'INSERT INTO canteen_products').length, 0);
  assert.equal(findCalls(calls, 'UPDATE canteen_products').length, 0);
});

test('a product missing from the new catalog is "removed" and deactivated when it is not a mass removal', async () => {
  const calls = useFakeClient({
    existingProducts: [
      { id: 1, normalized_name: 'kawa', price: '10.00', active: true },
      { id: 2, normalized_name: 'herbata', price: '5.00', active: true },
      { id: 3, normalized_name: 'cukier', price: '2.00', active: true },
      { id: 4, normalized_name: 'sok', price: '3.00', active: true },
    ],
  });

  // Only "kawa" missing out of 4 (25%) -- clearly under the 30% default
  // mass-removal threshold (see the dedicated mass-removal test below).
  const result = await diffAndApplyCatalog({
    facilityId: 1,
    extractionRunId: 10,
    parsedItems: [
      { name: 'Herbata', price: 5.0, unit: null },
      { name: 'Cukier', price: 2.0, unit: null },
      { name: 'Sok', price: 3.0, unit: null },
      { name: 'Woda', price: 1.0, unit: null },
    ],
  });

  const removed = result.filter((c) => c.type === 'removed');
  assert.equal(removed.length, 1);
  assert.equal(removed[0].flagged, false);
  assert.equal(removed[0].applied, true);
  assert.ok(findCalls(calls, 'UPDATE canteen_products').some((c) => c.params[0] === 1));
});

test("removing a large share of a facility's catalog in one import is flagged as mass removal and held back", async () => {
  const calls = useFakeClient({
    existingProducts: [
      { id: 1, normalized_name: 'kawa', price: '10.00', active: true },
      { id: 2, normalized_name: 'herbata', price: '5.00', active: true },
      { id: 3, normalized_name: 'cukier', price: '2.00', active: true },
    ],
  });

  // Only "kawa" survives -- 2/3 removed (66%), well above the 30% default.
  const result = await diffAndApplyCatalog({
    facilityId: 1,
    extractionRunId: 10,
    parsedItems: [{ name: 'Kawa', price: 10.0, unit: null }],
  });

  const removed = result.filter((c) => c.type === 'removed');
  assert.equal(removed.length, 2);
  assert.ok(removed.every((c) => c.flagged && !c.applied));
  assert.ok(removed.every((c) => /masowe usunięcie/i.test(c.flagReason)));
  assert.equal(findCalls(calls, 'UPDATE canteen_products').length, 0);
});

test('a previously-removed product reappearing is recorded as "reappeared", not "added"', async () => {
  useFakeClient({ existingProducts: [{ id: 1, normalized_name: 'kawa', price: '10.00', active: false }] });

  const result = await diffAndApplyCatalog({
    facilityId: 1,
    extractionRunId: 10,
    parsedItems: [{ name: 'Kawa', price: 10.0, unit: null }],
  });

  assert.equal(result[0].type, 'reappeared');
  assert.equal(result[0].applied, true);
});

test('an active product with an unchanged price produces no change at all', async () => {
  useFakeClient({ existingProducts: [{ id: 1, normalized_name: 'kawa', price: '10.00', active: true }] });

  const result = await diffAndApplyCatalog({
    facilityId: 1,
    extractionRunId: 10,
    parsedItems: [{ name: 'Kawa', price: 10.0, unit: null }],
  });

  assert.deepEqual(result, []);
});

test('a query failure mid-transaction rolls back and rethrows, never commits', async () => {
  const calls = useFakeClient({
    existingProducts: [],
    onQuery: (s) => {
      if (s.startsWith('INSERT INTO canteen_catalog_changes')) throw new Error('connection refused');
    },
  });

  await assert.rejects(
    () =>
      diffAndApplyCatalog({
        facilityId: 1,
        extractionRunId: 10,
        parsedItems: [{ name: 'Kawa', price: 10.0, unit: null }],
      }),
    /connection refused/,
  );
  assert.equal(findCalls(calls, 'ROLLBACK').length, 1);
  assert.equal(findCalls(calls, 'COMMIT').length, 0);
});

test('applyPendingChange returns false for an unknown or already-applied change id', async () => {
  useFakeClient({ changeRow: null });

  const applied = await applyPendingChange(999);
  assert.equal(applied, false);
});

test('applyPendingChange upserts the stored change into canteen_products and marks it applied', async () => {
  const calls = useFakeClient({
    changeRow: {
      id: 42,
      facility_id: 1,
      product_id: null,
      normalized_name: 'kawa',
      display_name: 'Kawa',
      change_type: 'price_changed',
      new_price: '35.00',
      unit: null,
      applied: false,
    },
  });

  const applied = await applyPendingChange(42);

  assert.equal(applied, true);
  assert.equal(findCalls(calls, 'INSERT INTO canteen_products').length, 1);
  const changeUpdate = findCalls(calls, 'UPDATE canteen_catalog_changes SET applied = true');
  assert.equal(changeUpdate.length, 1);
  assert.deepEqual(changeUpdate[0].params, [42]);
});

test('applyPendingChange deactivates the product for a held-back "removed" change', async () => {
  const calls = useFakeClient({
    changeRow: {
      id: 43,
      facility_id: 1,
      product_id: 7,
      normalized_name: 'herbata',
      display_name: 'Herbata',
      change_type: 'removed',
      new_price: null,
      unit: null,
      applied: false,
    },
  });

  const applied = await applyPendingChange(43);

  assert.equal(applied, true);
  const productUpdate = findCalls(calls, 'UPDATE canteen_products SET active = false');
  assert.equal(productUpdate.length, 1);
  assert.deepEqual(productUpdate[0].params, [7]);
});

test.after(() => {
  dbMock.restore();
});
