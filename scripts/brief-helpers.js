/* ============================================================
   brief-helpers.js — Pure helper functions for generate-brief.js
   Kept separate (and side-effect-free) so they're easy to unit test
   without triggering generate-brief.js's top-level API-key check.
   ============================================================ */

/**
 * From the last few archived editions, build the set of bank names
 * that already received story/opportunity coverage, so the prompt
 * can steer toward banks that haven't been covered recently.
 * @param {Array<{stories?: Array<{bank?: string}>, opportunities?: Array<{bank?: string}>}>} recentEditions
 * @returns {Set<string>}
 */
export function recentlyCoveredBanks(recentEditions) {
  const covered = new Set();
  for (const edition of recentEditions) {
    for (const story of edition?.stories || []) {
      if (story.bank) covered.add(story.bank);
    }
    for (const opp of edition?.opportunities || []) {
      if (opp.bank) covered.add(opp.bank);
    }
  }
  return covered;
}

/**
 * Split the bank universe into bulge bracket vs. smaller banks, and list
 * which smaller banks are due for coverage (weren't covered recently).
 * Bulge brackets stay the default priority; the returned dueForCoverage
 * list is what the prompt uses to guarantee smaller banks a real,
 * recurring presence instead of being crowded out.
 * @param {Array<{name: string, type: string}>} banks — from banks.json
 * @param {Set<string>} covered — from recentlyCoveredBanks()
 * @returns {{ bulgeBracket: string[], dueForCoverage: string[] }}
 */
export function pickRotationPriority(banks, covered) {
  const bulgeBracket = banks.filter(b => b.type === 'Bulge Bracket').map(b => b.name);
  const smaller = banks.filter(b => b.type !== 'Bulge Bracket');
  const dueForCoverage = smaller.filter(b => !covered.has(b.name)).map(b => b.name);
  // If every smaller bank was covered recently, fall back to all of them
  // rather than handing the prompt an empty rotation list.
  return {
    bulgeBracket,
    dueForCoverage: dueForCoverage.length > 0 ? dueForCoverage : smaller.map(b => b.name)
  };
}

/**
 * Drop any story or opportunity tagged "Speculative" that doesn't carry
 * a real source_url — an unsourced rumor must never ship.
 * @param {{stories?: Array, opportunities?: Array}} brief
 * @returns {{stories: Array, opportunities: Array}}
 */
export function dropUnsourcedSpeculative(brief) {
  const clean = item => item.confidence !== 'Speculative' || Boolean(item.source_url);
  return {
    stories: (brief.stories || []).filter(clean),
    opportunities: (brief.opportunities || []).filter(clean)
  };
}

/* ============================================================
   Opportunity carry-forward
   Stories are news (48h fresh, dropped daily). Opportunities are
   live deal processes that run for weeks — a "big" one stays in the
   brief for a few business days so a rep who saw it Monday still has
   the reason-to-call Wednesday, even on a slow news day. Re-confirming
   an opp (the model resurfaces it) resets its clock.
   ============================================================ */

const URGENCY_RANK = { HOT: 0, WARM: 1 };
const CONFIDENCE_RANK = { Filed: 0, Reported: 1, Speculative: 2 };

// Named live-process signals — an opp about one of these is a multi-week
// process worth carrying even if today's news cycle didn't resurface it.
const PROCESS_KEYWORDS = [
  'sale', 'sell', 'divest', 'tender', 'restructur', 'raise', 'offering',
  'bought deal', 'recapitaliz', 'refinanc', 'merger', 'acquisition',
  'strategic alternative', 'defense', 'defence', 'capital raise', 'ipo'
];

// Filler tokens that carry no deal identity — advisory verbs, articles,
// prepositions, and role words that vary freely between rewordings.
const KEY_STOPWORDS = new Set([
  'the', 'a', 'an', 'on', 'of', 'to', 'for', 'its', 'and', 'as', 'in', 'at',
  'adviser', 'advisor', 'advising', 'advises', 'advise', 'advised', 'advisers',
  'joint', 'lead', 'financial', 'sole', 'co', 'active', 'bookrunner', 'bookrunners',
  'retained', 'running', 'run', 'runs', 'special', 'is', 'on'
]);

/**
 * Stable identity for an opportunity: its bank plus an ORDER-INDEPENDENT
 * fingerprint of the deal. Rewordings of the same deal ("Advising X on its
 * offer for Y" vs "advises X on the Y offer") must collapse to one key, so we
 * strip the bank's own name and filler words, then use the sorted set of the
 * remaining significant tokens.
 * @param {{bank?: string, sector?: string, headline?: string, deal?: string}} opp
 * @returns {string}
 */
export function opportunityKey(opp) {
  const bank = (opp.bank || '').toLowerCase().trim();
  // Tokens that make up the bank's own name shouldn't distinguish deals.
  const bankTokens = new Set(bank.split(/[^a-z0-9]+/).filter(Boolean));
  const source = (opp.deal || opp.headline || opp.sector || '').toLowerCase();
  const tokens = source
    .split(/[^a-z0-9]+/)
    .filter(t => t && !KEY_STOPWORDS.has(t) && !bankTokens.has(t));
  const fingerprint = [...new Set(tokens)].sort().join(' ');
  return `${bank}::${fingerprint}`;
}

/**
 * Is this opportunity "big" enough to persist across editions?
 * Rule: urgency HOT, OR confidence Filed, OR a named live process.
 * @param {{urgency?: string, confidence?: string, headline?: string, sector?: string}} opp
 * @returns {boolean}
 */
export function qualifiesForCarry(opp) {
  if ((opp.urgency || '').toUpperCase() === 'HOT') return true;
  if (opp.confidence === 'Filed') return true;
  const text = `${opp.headline || ''} ${opp.sector || ''}`.toLowerCase();
  return PROCESS_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * Count business days in the interval (fromISO, toISO] — i.e. weekdays
 * strictly after `from` up to and including `to`. Same day → 0,
 * Fri → Mon → 1, Fri → Tue → 2. Dates are ISO "YYYY-MM-DD" (UTC).
 * @param {string} fromISO
 * @param {string} toISO
 * @returns {number}
 */
export function businessDaysBetween(fromISO, toISO) {
  const from = new Date(`${fromISO}T00:00:00Z`);
  const to = new Date(`${toISO}T00:00:00Z`);
  if (isNaN(from) || isNaN(to) || to <= from) return 0;
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/**
 * Human-facing freshness badge for an opp given today's date:
 * "NEW" on its debut edition, else "Day N" (business days running).
 * @param {{first_seen?: string}} opp
 * @param {string} today ISO date
 * @returns {string}
 */
export function carryBadge(opp, today) {
  if (!opp.first_seen || opp.first_seen === today) return 'NEW';
  return `Day ${businessDaysBetween(opp.first_seen, today) + 1}`;
}

/**
 * Sort opportunities biggest-and-most-recent first: primary by impact
 * (HOT > WARM, then Filed > Reported > Speculative), secondary by recency
 * (most recently confirmed floats up). Returns a new array.
 * @param {Array} opps
 * @returns {Array}
 */
export function sortOpportunities(opps) {
  const impact = o =>
    (URGENCY_RANK[(o.urgency || '').toUpperCase()] ?? 2) * 10 +
    (CONFIDENCE_RANK[o.confidence] ?? 3);
  return [...opps].sort((a, b) => {
    const d = impact(a) - impact(b);
    if (d !== 0) return d;
    // Recency: later last_confirmed first (string compare works for ISO dates).
    return (b.last_confirmed || '').localeCompare(a.last_confirmed || '');
  });
}

/**
 * Merge today's freshly-generated opportunities with qualifying ones carried
 * from the previous edition, then sort. Fresh opps win on key collision (they
 * re-confirm a running deal, resetting its clock but keeping its first_seen).
 * Carried opps that weren't resurfaced expire once they exceed the business-day
 * window; no more than `maxCarried` carried opps ride along per edition.
 *
 * @param {object} opts
 * @param {Array}  opts.fresh    today's opportunities from the model
 * @param {Array}  [opts.previous] previous edition's opportunities
 * @param {string} opts.today    ISO date of the edition being built
 * @param {number} [opts.windowBusinessDays=3]
 * @param {number} [opts.maxCarried=3]
 * @returns {Array} merged, stamped, sorted opportunities
 */
export function carryForwardOpportunities({
  fresh = [],
  previous = [],
  today,
  windowBusinessDays = 3,
  maxCarried = 3
}) {
  // 1) Stamp today's fresh opps. Re-confirming a carried opp keeps its
  //    original first_seen but resets last_confirmed to today.
  const prevByKey = new Map((previous || []).map(o => [opportunityKey(o), o]));
  const freshStamped = fresh.map(o => {
    const prior = prevByKey.get(opportunityKey(o));
    return {
      ...o,
      first_seen: prior?.first_seen || o.first_seen || today,
      last_confirmed: today
    };
  });
  const freshKeys = new Set(freshStamped.map(opportunityKey));

  // 2) Collect qualifying carried opps the model did NOT resurface today,
  //    that are still inside the window.
  const carried = (previous || [])
    .filter(o => !freshKeys.has(opportunityKey(o)))
    .filter(qualifiesForCarry)
    .map(o => ({
      ...o,
      first_seen: o.first_seen || o.last_confirmed || today,
      last_confirmed: o.last_confirmed || today
    }))
    .filter(o => businessDaysBetween(o.last_confirmed, today) <= windowBusinessDays);

  // 3) Keep the freshest-confirmed carried opps up to the cap.
  const carriedRanked = sortOpportunities(carried).slice(0, maxCarried);

  // 4) Sort biggest-and-most-recent, then reassign sequential ids so the
  //    merged set never collides (fresh + carried can share the model's
  //    "o1"/"o2"), and stamp a freshness badge for the UI.
  const merged = sortOpportunities([...freshStamped, ...carriedRanked]);
  return merged.map((o, i) => ({
    ...o,
    id: `o${i + 1}`,
    carry_badge: carryBadge(o, today)
  }));
}
