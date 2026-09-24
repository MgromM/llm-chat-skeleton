import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import multer from 'multer';

// Mocked so tests don't write real log lines — real behavior of the logger
// itself isn't what's under test here.
const loggerMock = mock.module('../config/logger.js', {
  exports: { logger: { error: mock.fn(), warn: mock.fn() } },
});

const { logger } = await import('../config/logger.js');
const { errorHandler } = await import('./errorHandler.js');

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test.beforeEach(() => {
  logger.error.mock.resetCalls();
  logger.warn.mock.resetCalls();
});

test('a MulterError (e.g. file too large) becomes a 400, not a 500', () => {
  const err = new multer.MulterError('LIMIT_FILE_SIZE');
  const res = fakeRes();

  errorHandler(err, { path: '/document-gateway' }, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, err.message);
  assert.equal(logger.error.mock.callCount(), 0);
  assert.equal(logger.warn.mock.callCount(), 1);
});

test('a plain Error with no .status falls back to 500 and logs at error level', () => {
  const err = new Error('unexpected boom');
  const res = fakeRes();

  errorHandler(err, { path: '/whatever' }, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'unexpected boom');
  assert.equal(logger.error.mock.callCount(), 1);
  assert.equal(logger.warn.mock.callCount(), 0);
});

test('an error with an explicit .status is respected as-is', () => {
  const err = Object.assign(new Error('not found'), { status: 404 });
  const res = fakeRes();

  errorHandler(err, { path: '/x/1' }, res, () => {});

  assert.equal(res.statusCode, 404);
  assert.equal(logger.warn.mock.callCount(), 1);
});

test.after(() => {
  loggerMock.restore();
});
