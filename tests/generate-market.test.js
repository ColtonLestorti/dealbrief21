import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMarketData } from '../scripts/generate-market.js';

test('validateMarketData accepts a well-formed market object', () => {
  const result = validateMarketData({
    ticker: [{ label: 'S&P 500', value: '7,421.85', change: '+0.77%', positive: true }],
    market_snapshot: {
      indices: [{ label: 'S&P 500', value: '7,421.85', change: '+0.77%', positive: true }],
      bank_stocks: [],
      macro_note: 'Markets steady.'
    }
  });
  assert.equal(result.ok, true);
});

test('validateMarketData rejects an empty ticker', () => {
  const result = validateMarketData({
    ticker: [],
    market_snapshot: { indices: [{ label: 'S&P 500', value: '1', change: '1', positive: true }] }
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /ticker/);
});

test('validateMarketData rejects a missing market_snapshot', () => {
  const result = validateMarketData({
    ticker: [{ label: 'S&P 500', value: '1', change: '1', positive: true }]
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /market_snapshot/);
});

test('validateMarketData rejects empty market_snapshot.indices', () => {
  const result = validateMarketData({
    ticker: [{ label: 'S&P 500', value: '1', change: '1', positive: true }],
    market_snapshot: { indices: [] }
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /indices/);
});
