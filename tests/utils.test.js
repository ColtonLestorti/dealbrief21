import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMarketDataFresh, confidenceTooltip } from '../assets/js/utils.js';

test('isMarketDataFresh returns true when market data was generated today', () => {
  assert.equal(isMarketDataFresh('2026-07-01', '2026-07-01T14:35:00Z'), true);
});

test('isMarketDataFresh returns false when market data is from a prior day', () => {
  assert.equal(isMarketDataFresh('2026-07-01', '2026-06-30T21:15:00Z'), false);
});

test('isMarketDataFresh returns false when either input is missing', () => {
  assert.equal(isMarketDataFresh(null, '2026-07-01T14:35:00Z'), false);
  assert.equal(isMarketDataFresh('2026-07-01', null), false);
});

test('confidenceTooltip maps known confidence values', () => {
  assert.equal(confidenceTooltip('Filed'), 'From an SEC filing — authoritative');
  assert.equal(confidenceTooltip('Reported'), 'From news — verify before quoting');
  assert.equal(confidenceTooltip('Speculative'), 'Rumored/unconfirmed — verify before quoting on a call');
});

test('confidenceTooltip falls back for unknown values', () => {
  assert.equal(confidenceTooltip('Bogus'), 'From news — verify before quoting');
});
