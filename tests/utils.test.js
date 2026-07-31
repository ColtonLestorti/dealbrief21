import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMarketDataFresh, confidenceTooltip, coverageTeams } from '../assets/js/utils.js';

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

test('coverageTeams infers TMT from a tech deal', () => {
  assert.deepEqual(
    coverageTeams({ sector: 'Technology / AI Infrastructure', tags: ['ai-infrastructure', 'merger'] }),
    ['TMT']
  );
});

test('coverageTeams infers Healthcare from biopharma', () => {
  assert.deepEqual(coverageTeams({ sector: 'Biopharma / Healthcare' }), ['Healthcare']);
});

test('coverageTeams infers FIG for market-structure/exchange deals', () => {
  assert.deepEqual(
    coverageTeams({ sector: 'Financial Services / Market Structure' }),
    ['FIG']
  );
});

test('coverageTeams can surface multiple teams for a cross-sector deal', () => {
  // Fintech reads as both TMT (fintech/payments) and FIG (specialty finance).
  const teams = coverageTeams({ sector: 'Fintech / Specialty Finance' });
  assert.ok(teams.includes('TMT') && teams.includes('FIG'));
});

test('coverageTeams returns teams in canonical order', () => {
  // TMT precedes FIG in the canonical order regardless of match order.
  assert.deepEqual(coverageTeams({ sector: 'Fintech / Specialty Finance' }), ['TMT', 'FIG']);
});

test('coverageTeams honors an explicit coverage_team override', () => {
  assert.deepEqual(
    coverageTeams({ sector: 'Biopharma', coverage_team: 'Special Situations' }),
    ['Special Situations']
  );
  assert.deepEqual(
    coverageTeams({ sector: 'Energy', coverage_team: ['Energy & Power', 'Restructuring'] }),
    ['Energy & Power', 'Restructuring']
  );
});

test('coverageTeams falls back to M&A when nothing matches', () => {
  assert.deepEqual(coverageTeams({ sector: 'Miscellaneous widgets' }), ['M&A']);
  assert.deepEqual(coverageTeams({}), ['M&A']);
  assert.deepEqual(coverageTeams(null), ['M&A']);
});
