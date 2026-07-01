import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentlyCoveredBanks, pickRotationPriority, dropUnsourcedSpeculative } from '../scripts/brief-helpers.js';

test('recentlyCoveredBanks collects bank names from stories and opportunities', () => {
  const editions = [
    { stories: [{ bank: 'Goldman Sachs' }, { bank: null }], opportunities: [{ bank: 'Evercore' }] },
    { stories: [{ bank: 'Goldman Sachs' }] }
  ];
  const result = recentlyCoveredBanks(editions);
  assert.deepEqual([...result].sort(), ['Evercore', 'Goldman Sachs']);
});

test('recentlyCoveredBanks handles editions with no stories/opportunities', () => {
  const result = recentlyCoveredBanks([{}, { stories: [] }]);
  assert.equal(result.size, 0);
});

test('pickRotationPriority separates bulge bracket from smaller banks and finds ones due for coverage', () => {
  const banks = [
    { name: 'Goldman Sachs', type: 'Bulge Bracket' },
    { name: 'Evercore', type: 'Elite Boutique' },
    { name: 'Baird', type: 'Middle Market' }
  ];
  const covered = new Set(['Evercore']);
  const result = pickRotationPriority(banks, covered);
  assert.deepEqual(result.bulgeBracket, ['Goldman Sachs']);
  assert.deepEqual(result.dueForCoverage, ['Baird']);
});

test('pickRotationPriority falls back to all smaller banks if all were recently covered', () => {
  const banks = [
    { name: 'Evercore', type: 'Elite Boutique' },
    { name: 'Baird', type: 'Middle Market' }
  ];
  const covered = new Set(['Evercore', 'Baird']);
  const result = pickRotationPriority(banks, covered);
  assert.deepEqual(result.dueForCoverage.sort(), ['Baird', 'Evercore']);
});

test('dropUnsourcedSpeculative drops Speculative items without a source_url', () => {
  const brief = {
    stories: [
      { id: 's1', confidence: 'Speculative', source_url: 'https://example.com/a' },
      { id: 's2', confidence: 'Speculative' },
      { id: 's3', confidence: 'Reported' }
    ],
    opportunities: [
      { id: 'o1', confidence: 'Speculative' }
    ]
  };
  const result = dropUnsourcedSpeculative(brief);
  assert.deepEqual(result.stories.map(s => s.id), ['s1', 's3']);
  assert.deepEqual(result.opportunities.map(o => o.id), []);
});
