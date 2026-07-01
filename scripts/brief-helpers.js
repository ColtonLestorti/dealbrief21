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
