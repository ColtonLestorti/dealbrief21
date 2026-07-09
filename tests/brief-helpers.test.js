import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recentlyCoveredBanks,
  pickRotationPriority,
  dropUnsourcedSpeculative,
  opportunityKey,
  qualifiesForCarry,
  businessDaysBetween,
  carryBadge,
  sortOpportunities,
  carryForwardOpportunities
} from '../scripts/brief-helpers.js';

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

// ── Opportunity carry-forward ────────────────────────────────────

test('opportunityKey is stable across reworded headlines for the same deal', () => {
  const a = { bank: 'PJT Partners', headline: 'Advising Genel Energy on its £271M offer for Capricorn Energy' };
  const b = { bank: 'PJT Partners', headline: 'PJT advises Genel Energy on the £271M Capricorn offer' };
  assert.equal(opportunityKey(a), opportunityKey(b));
});

test('opportunityKey distinguishes different banks on the same deal', () => {
  const a = { bank: 'PJT Partners', headline: 'Genel Energy Capricorn offer' };
  const b = { bank: 'Jefferies', headline: 'Genel Energy Capricorn offer' };
  assert.notEqual(opportunityKey(a), opportunityKey(b));
});

test('qualifiesForCarry: HOT, Filed, or named process qualify; routine WARM does not', () => {
  assert.equal(qualifiesForCarry({ urgency: 'HOT', headline: 'meeting notes' }), true);
  assert.equal(qualifiesForCarry({ confidence: 'Filed', headline: 'meeting notes' }), true);
  assert.equal(qualifiesForCarry({ urgency: 'WARM', headline: 'Running the sale of a stake' }), true);
  assert.equal(qualifiesForCarry({ urgency: 'WARM', confidence: 'Reported', headline: 'general coverage note' }), false);
});

test('businessDaysBetween skips weekends', () => {
  assert.equal(businessDaysBetween('2026-07-09', '2026-07-09'), 0); // same day
  assert.equal(businessDaysBetween('2026-07-09', '2026-07-10'), 1); // Thu→Fri
  assert.equal(businessDaysBetween('2026-07-10', '2026-07-13'), 1); // Fri→Mon (skip wknd)
  assert.equal(businessDaysBetween('2026-07-06', '2026-07-09'), 3); // Mon→Thu
});

test('carryBadge: NEW on debut, Day N after', () => {
  assert.equal(carryBadge({ first_seen: '2026-07-09' }, '2026-07-09'), 'NEW');
  assert.equal(carryBadge({}, '2026-07-09'), 'NEW');
  assert.equal(carryBadge({ first_seen: '2026-07-08' }, '2026-07-09'), 'Day 2');
  assert.equal(carryBadge({ first_seen: '2026-07-06' }, '2026-07-09'), 'Day 4');
});

test('sortOpportunities ranks by impact then recency', () => {
  const opps = [
    { id: 'warm-old', urgency: 'WARM', confidence: 'Reported', last_confirmed: '2026-07-07' },
    { id: 'hot-old', urgency: 'HOT', confidence: 'Reported', last_confirmed: '2026-07-06' },
    { id: 'hot-new', urgency: 'HOT', confidence: 'Reported', last_confirmed: '2026-07-09' },
    { id: 'hot-filed', urgency: 'HOT', confidence: 'Filed', last_confirmed: '2026-07-06' }
  ];
  assert.deepEqual(sortOpportunities(opps).map(o => o.id), ['hot-filed', 'hot-new', 'hot-old', 'warm-old']);
});

test('carryForwardOpportunities carries a qualifying, non-resurfaced opp and stamps dates', () => {
  const previous = [
    { id: 'o1', bank: 'PJT Partners', urgency: 'HOT', headline: 'Genel Energy Capricorn offer', first_seen: '2026-07-08', last_confirmed: '2026-07-08' }
  ];
  const fresh = [
    { id: 'n1', bank: 'RBC Capital Markets', urgency: 'WARM', confidence: 'Reported', headline: 'MDA Space bought deal' }
  ];
  const merged = carryForwardOpportunities({ fresh, previous, today: '2026-07-09' });
  const carried = merged.find(o => o.bank === 'PJT Partners');
  assert.ok(carried, 'PJT opp should carry forward');
  assert.equal(carried.first_seen, '2026-07-08');
  assert.equal(carried.last_confirmed, '2026-07-08'); // not resurfaced → clock not reset
  const freshOne = merged.find(o => o.bank === 'RBC Capital Markets');
  assert.equal(freshOne.first_seen, '2026-07-09');
  assert.equal(freshOne.last_confirmed, '2026-07-09');
});

test('carryForwardOpportunities resets the clock and keeps first_seen when an opp is resurfaced', () => {
  const previous = [
    { id: 'o1', bank: 'PJT Partners', urgency: 'HOT', headline: 'Genel Energy Capricorn offer', first_seen: '2026-07-07', last_confirmed: '2026-07-08' }
  ];
  const fresh = [
    { id: 'n1', bank: 'PJT Partners', urgency: 'HOT', headline: 'PJT advises Genel Energy on the Capricorn offer' }
  ];
  const merged = carryForwardOpportunities({ fresh, previous, today: '2026-07-09' });
  assert.equal(merged.length, 1, 'resurfaced opp must dedupe, not double');
  assert.equal(merged[0].first_seen, '2026-07-07');
  assert.equal(merged[0].last_confirmed, '2026-07-09');
});

test('carryForwardOpportunities expires opps past the business-day window', () => {
  const previous = [
    { id: 'stale', bank: 'PJT Partners', urgency: 'HOT', headline: 'Old deal', first_seen: '2026-07-01', last_confirmed: '2026-07-01' }
  ];
  const merged = carryForwardOpportunities({ fresh: [], previous, today: '2026-07-09', windowBusinessDays: 3 });
  assert.equal(merged.length, 0);
});

test('carryForwardOpportunities does not carry non-qualifying opps', () => {
  const previous = [
    { id: 'routine', bank: 'Baird', urgency: 'WARM', confidence: 'Reported', headline: 'general market color', last_confirmed: '2026-07-08' }
  ];
  const merged = carryForwardOpportunities({ fresh: [], previous, today: '2026-07-09' });
  assert.equal(merged.length, 0);
});

test('carryForwardOpportunities reassigns unique sequential ids and stamps a badge', () => {
  // Both fresh and previous use the model's "o1"/"o2" — the merge must not collide.
  const previous = [
    { id: 'o1', bank: 'PJT Partners', urgency: 'HOT', headline: 'Genel Capricorn offer', first_seen: '2026-07-08', last_confirmed: '2026-07-08' }
  ];
  const fresh = [
    { id: 'o1', bank: 'RBC Capital Markets', urgency: 'HOT', confidence: 'Reported', headline: 'MDA Space bought deal' },
    { id: 'o2', bank: 'Moelis', urgency: 'WARM', confidence: 'Reported', headline: 'TEG debt review' }
  ];
  const merged = carryForwardOpportunities({ fresh, previous, today: '2026-07-09' });
  const ids = merged.map(o => o.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  assert.deepEqual(ids, ['o1', 'o2', 'o3']);
  const carried = merged.find(o => o.bank === 'PJT Partners');
  assert.equal(carried.carry_badge, 'Day 2');
  assert.equal(merged.find(o => o.bank === 'RBC Capital Markets').carry_badge, 'NEW');
});

test('carryForwardOpportunities caps carried opps', () => {
  const previous = Array.from({ length: 5 }, (_, i) => ({
    id: `c${i}`, bank: `Bank ${i}`, urgency: 'HOT', headline: `deal ${i}`, last_confirmed: '2026-07-08'
  }));
  const merged = carryForwardOpportunities({ fresh: [], previous, today: '2026-07-09', maxCarried: 3 });
  assert.equal(merged.length, 3);
});
