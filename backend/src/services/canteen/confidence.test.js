import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeExtractionConfidence,
  needsReview,
  isImplausiblePriceChange,
  isMassRemoval,
  CANTEEN_REVIEW_CONFIDENCE_THRESHOLD,
} from './confidence.js';

test('computeExtractionConfidence blends OCR confidence and parse rate for an OCR source', () => {
  const confidence = computeExtractionConfidence({ ocrConfidence: 90, linesTotal: 10, linesParsed: 10 });
  // 0.4 * (90/100) + 0.6 * (10/10) = 0.36 + 0.6 = 0.96
  assert.ok(Math.abs(confidence - 0.96) < 1e-9);
});

test('computeExtractionConfidence falls back to parse rate alone for a structured file (ocrConfidence null)', () => {
  const confidence = computeExtractionConfidence({ ocrConfidence: null, linesTotal: 20, linesParsed: 15 });
  assert.ok(Math.abs(confidence - 0.75) < 1e-9);
});

test('computeExtractionConfidence is 0 when nothing parsed, never negative or NaN', () => {
  assert.equal(computeExtractionConfidence({ ocrConfidence: null, linesTotal: 0, linesParsed: 0 }), 0);
  assert.equal(computeExtractionConfidence({ ocrConfidence: 0, linesTotal: 10, linesParsed: 0 }), 0);
});

test('needsReview matches the configured threshold', () => {
  assert.equal(needsReview(CANTEEN_REVIEW_CONFIDENCE_THRESHOLD - 0.01), true);
  assert.equal(needsReview(CANTEEN_REVIEW_CONFIDENCE_THRESHOLD), false);
  assert.equal(needsReview(NaN), true);
  assert.equal(needsReview(undefined), true);
});

test('isImplausiblePriceChange flags a steep increase', () => {
  assert.equal(isImplausiblePriceChange(3.0, 35.0), true);
});

test('isImplausiblePriceChange flags a steep decrease just as readily as an increase', () => {
  assert.equal(isImplausiblePriceChange(35.0, 3.0), true);
});

test('isImplausiblePriceChange does not flag an ordinary price nudge', () => {
  assert.equal(isImplausiblePriceChange(3.0, 3.5), false);
});

test('isImplausiblePriceChange ignores non-positive prices rather than dividing by zero', () => {
  assert.equal(isImplausiblePriceChange(0, 5), false);
  assert.equal(isImplausiblePriceChange(5, 0), false);
});

test('isMassRemoval flags a batch at or above the configured ratio', () => {
  assert.equal(isMassRemoval(3, 10), true); // 30%
  assert.equal(isMassRemoval(2, 10), false); // 20%
});

test('isMassRemoval is false when there was nothing to remove from', () => {
  assert.equal(isMassRemoval(0, 0), false);
});
