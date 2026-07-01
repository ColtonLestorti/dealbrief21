# Live Market Updates & Deeper Bank Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an intraday market-data refresh (3x/day, independent of the once-daily full brief) and make the daily brief's stories/opportunities more thorough — doubled volume, bank-rotation weighting, source links on opportunities, and a clearly-labeled "Speculative" tier for real, cited rumors — per `docs/superpowers/specs/2026-07-01-live-market-updates-design.md`.

**Architecture:** Two fully independent GitHub Actions automations. The existing `generate-brief.js` (unchanged in shape, extended in content) keeps running once each weekday morning. A new `generate-market.js` + `market-update.yml` writes a separate `data/market.json` three times a day. The front-end merges the two client-side with a freshness check, so a stale `market.json` never overrides a fresher `daily.json`.

**Tech Stack:** Vanilla JS (ES modules, no bundler), Node.js 20 (the version pinned in CI), the Anthropic Messages API with the `web_search_20250305` tool, GitHub Actions for scheduling, GitHub Pages for hosting. Tests use Node's built-in `node:test` + `node:assert/strict` — zero new npm dependencies, consistent with this project's "no build step, no external runtime dependencies" convention.

## Global Constraints

- Static site on GitHub Pages; no backend, no user accounts/auth (per spec's "Explicitly Out of Scope").
- No new paid vendor/API beyond the existing Anthropic API usage — market data comes from Claude + web search, not a separate stock-data API (per spec).
- No build step, no external npm dependencies (existing project convention — confirmed no `package.json`/`node_modules` exist prior to this plan).
- GitHub Actions CI pins `node-version: '20'` (from the existing `.github/workflows/daily-brief.yml`).
- The existing `daily-brief.yml` / `generate-brief.js` edition-increment and archive-writing behavior must keep working unchanged (regression constraint).

---

### Task 1: Add `package.json` so ESM scripts run reliably on Node 20

**Why:** `scripts/generate-brief.js` and `scripts/edgar.js` already use `import`/`export` syntax, but there is no `package.json` anywhere in the repo declaring `"type": "module"`. Without it, whether a bare `.js` file with ESM syntax runs depends on version-specific auto-detection heuristics that vary across Node releases — not something to rely on implicitly, especially since this plan adds a new script using the same ESM style. An explicit `package.json` removes all ambiguity, for every script, on every Node version.

**Files:**
- Create: `package.json`

**Interfaces:**
- Produces: repo now resolves as an ES module project — every task after this one can rely on `import`/`export` working in plain `node script.js` without further checks.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dealbrief",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Verify ESM resolution works against a real existing module**

Run:
```
node -e "import('./scripts/edgar.js').then(m => console.log(typeof m.getFiledMandates))"
```
Expected output: `function`

(This exercises real ESM module resolution against `scripts/edgar.js`, which has no top-level side effects requiring an API key — unlike `generate-brief.js`, which calls `process.exit(1)` at module load if `ANTHROPIC_API_KEY` is unset, so it's not a safe smoke-test target.)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Add package.json with type:module for reliable ESM execution on Node 20"
```

---

### Task 2: Add shared pure helpers to `utils.js` (market freshness check, cache-busting fetch, confidence tooltip)

**Files:**
- Modify: `assets/js/utils.js` (append after the existing `expandCard` function, currently ending at line 142)
- Test: `tests/utils.test.js`

**Interfaces:**
- Produces:
  - `fetchDataFresh(file: string): Promise<object>` — like existing `fetchData`, but bypasses HTTP/CDN caching (query-param cache-bust + `cache: 'no-store'`). Used for polling `market.json`.
  - `isMarketDataFresh(dailyDate: string, marketGeneratedAt: string): boolean` — true only if `marketGeneratedAt`'s date matches `dailyDate`.
  - `confidenceTooltip(confidence: string): string` — maps `'Filed' | 'Reported' | 'Speculative'` (or anything else) to a tooltip string.
- Consumes: nothing new — pure functions and a `fetch` call, same primitives already used elsewhere in `utils.js`.

- [ ] **Step 1: Write the failing tests**

Create `tests/utils.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/utils.test.js`
Expected: FAIL — `isMarketDataFresh is not a function` / `confidenceTooltip is not a function` (they don't exist yet).

- [ ] **Step 3: Implement the functions**

Append to `assets/js/utils.js` (after the existing `expandCard` function, which ends at line 142):

```js

/**
 * Fetch a JSON file from the data directory, bypassing HTTP/CDN caches.
 * Use for data that refreshes intraday (e.g. market.json polling).
 * @param {string} file — filename, e.g. "market.json"
 * @returns {Promise<object>}
 */
export async function fetchDataFresh(file) {
  const res = await fetch(`data/${file}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${file}`);
  return res.json();
}

/**
 * Decide whether intraday market.json data is fresher than daily.json's
 * embedded ticker/market_snapshot. market.json only wins if it was
 * actually regenerated today — otherwise it may hold yesterday's
 * afternoon data, which is staler than a same-morning daily.json.
 * @param {string} dailyDate — daily.json's "date" field, e.g. "2026-07-01"
 * @param {string} marketGeneratedAt — market.json's "generated_at" ISO timestamp
 * @returns {boolean}
 */
export function isMarketDataFresh(dailyDate, marketGeneratedAt) {
  if (!dailyDate || !marketGeneratedAt) return false;
  return marketGeneratedAt.slice(0, 10) === dailyDate;
}

/**
 * Map a story/opportunity confidence tag to its tooltip explanation.
 * @param {string} confidence — 'Filed' | 'Reported' | 'Speculative'
 * @returns {string}
 */
export function confidenceTooltip(confidence) {
  const map = {
    Filed: 'From an SEC filing — authoritative',
    Reported: 'From news — verify before quoting',
    Speculative: 'Rumored/unconfirmed — verify before quoting on a call'
  };
  return map[confidence] || 'From news — verify before quoting';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/utils.test.js`
Expected: PASS — 5 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add assets/js/utils.js tests/utils.test.js
git commit -m "Add fetchDataFresh, isMarketDataFresh, confidenceTooltip helpers"
```

---

### Task 3: Create `scripts/brief-helpers.js` — pure bank-rotation and speculative-validation logic

**Why a separate file:** `generate-brief.js` unconditionally calls `generate().catch(...)` at module load and exits if `ANTHROPIC_API_KEY` is missing — importing it in a test would crash the test process. Keeping the new pure logic in its own side-effect-free module makes it trivially unit-testable and keeps `generate-brief.js` focused on orchestration.

**Files:**
- Create: `scripts/brief-helpers.js`
- Test: `tests/brief-helpers.test.js`

**Interfaces:**
- Produces:
  - `recentlyCoveredBanks(recentEditions: Array<{stories?, opportunities?}>): Set<string>`
  - `pickRotationPriority(banks: Array<{name, type}>, covered: Set<string>): { bulgeBracket: string[], dueForCoverage: string[] }`
  - `dropUnsourcedSpeculative(brief: {stories?, opportunities?}): { stories: Array, opportunities: Array }`
- Consumes: nothing — pure functions over plain data, no I/O.

- [ ] **Step 1: Write the failing tests**

Create `tests/brief-helpers.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/brief-helpers.test.js`
Expected: FAIL — `Cannot find module '../scripts/brief-helpers.js'`.

- [ ] **Step 3: Implement `scripts/brief-helpers.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/brief-helpers.test.js`
Expected: PASS — 5 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/brief-helpers.js tests/brief-helpers.test.js
git commit -m "Add bank-rotation and speculative-validation helpers"
```

---

### Task 4: Create `scripts/generate-market.js` — intraday market snapshot generator

**Files:**
- Create: `scripts/generate-market.js`
- Test: `tests/generate-market.test.js`

**Interfaces:**
- Produces: `validateMarketData(data: object): {ok: true} | {ok: false, reason: string}` (exported for testing). Writes `data/market.json` with shape `{ generated_at, ticker, market_snapshot }` when run directly.
- Consumes: `ANTHROPIC_API_KEY` env var (same as `generate-brief.js`), global `fetch` (Node 20 built-in).

- [ ] **Step 1: Write the failing tests**

Create `tests/generate-market.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/generate-market.test.js`
Expected: FAIL — `Cannot find module '../scripts/generate-market.js'`.

- [ ] **Step 3: Implement `scripts/generate-market.js`**

```js
#!/usr/bin/env node
/* ============================================================
   generate-market.js
   Generates data/market.json — a lightweight, intraday refresh of
   just the ticker and market snapshot (indices, bank stocks, a
   one-line macro note). Runs several times a day, independent of
   the once-daily full brief in generate-brief.js.

   Run locally:   ANTHROPIC_API_KEY=sk-... node scripts/generate-market.js
   Run in CI:     handled by .github/workflows/market-update.yml
   ============================================================ */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You produce a single JSON object with the current market snapshot for a
banking sales-intelligence tool. Use web search to find REAL, current market data. Return ONLY a
JSON object (no markdown, no backticks, no preamble) with this exact schema:

{
  "ticker": [ { "label": "S&P 500", "value": "...", "change": "...", "positive": true } ],
  "market_snapshot": {
    "indices": [ { "label": "S&P 500", "value": "...", "change": "...", "positive": true } ],
    "bank_stocks": [ { "ticker": "GS", "price": "...", "change": "...", "positive": true } ],
    "macro_note": "..."
  }
}

Rules:
- Pull the most recent price for major indices (S&P 500, Nasdaq, Dow, Russell 2000), the 10Y and
  2Y Treasury yields, VIX, and WTI crude for "ticker".
- Pull current prices for major bank stocks (GS, MS, JPM, EVR, LAZ, JEF) for "bank_stocks".
- "macro_note" is one sentence on what's moving markets right now.
- ACCURACY IS CRITICAL: if you cannot verify a number from search, omit that item entirely rather
  than estimate — a short ticker is better than a wrong one.
- Output must be valid JSON and nothing else.`;

const USER_PROMPT = 'Generate the current market snapshot. Search the web for today\'s live ' +
  'market levels and bank stock prices, then return the JSON object exactly as specified.';

/**
 * Validate that a parsed market-data object has the fields required
 * before writing it to disk. Exported for unit testing.
 * @param {object} data
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateMarketData(data) {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'not an object' };
  if (!Array.isArray(data.ticker) || data.ticker.length === 0) {
    return { ok: false, reason: 'ticker is missing or empty' };
  }
  if (!data.market_snapshot || typeof data.market_snapshot !== 'object') {
    return { ok: false, reason: 'market_snapshot is missing' };
  }
  if (!Array.isArray(data.market_snapshot.indices) || data.market_snapshot.indices.length === 0) {
    return { ok: false, reason: 'market_snapshot.indices is missing or empty' };
  }
  return { ok: true };
}

async function generate() {
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  console.log(`Generating market snapshot using ${MODEL}...`);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  let market;
  try {
    market = JSON.parse(clean);
  } catch (err) {
    console.error('Failed to parse JSON from model output. Raw text:\n', clean.slice(0, 1000));
    throw err;
  }

  const validation = validateMarketData(market);
  if (!validation.ok) {
    throw new Error(`Generated market data failed validation: ${validation.reason}`);
  }

  market.generated_at = new Date().toISOString();

  writeFileSync(join(ROOT, 'data/market.json'), JSON.stringify(market, null, 2) + '\n');
  console.log(`✓ Wrote data/market.json — generated_at ${market.generated_at}`);
}

// Only auto-run when executed directly (`node scripts/generate-market.js`),
// not when imported by tests — importing must never trigger a real API call.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  generate().catch(err => {
    console.error('Market snapshot generation failed:', err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/generate-market.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Manual smoke test with a real API key (optional but recommended)**

Run: `ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-market.js`
Expected: prints `✓ Wrote data/market.json — generated_at <ISO timestamp>`, and `data/market.json` exists with `ticker`/`market_snapshot` populated with real-looking values.

If you don't have a key handy, skip this step — Task 5's CI dry-run covers it with the real secret already configured in the repo.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-market.js tests/generate-market.test.js
git commit -m "Add generate-market.js for intraday market snapshot generation"
```

---

### Task 5: Add `.github/workflows/market-update.yml` — schedule the intraday refresh

**Files:**
- Create: `.github/workflows/market-update.yml`

**Interfaces:**
- Consumes: `scripts/generate-market.js` (Task 4), the existing `ANTHROPIC_API_KEY` repository secret (already configured for `daily-brief.yml`, per `docs/AUTOMATION.md`).
- Produces: `data/market.json`, committed to the repo 3x per weekday.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Update Market Snapshot

# Runs 3x on weekdays: market open, midday, and close (times are ET,
# expressed as fixed UTC — same simplification the existing daily-brief
# workflow uses, not adjusted for daylight saving).
#   9:35 AM ET  -> 14:35 UTC
#  12:30 PM ET  -> 17:30 UTC
#   4:15 PM ET  -> 21:15 UTC
on:
  schedule:
    - cron: '35 14 * * 1-5'
    - cron: '30 17 * * 1-5'
    - cron: '15 21 * * 1-5'
  workflow_dispatch:          # Manual "Run workflow" button

permissions:
  contents: write

jobs:
  update-market:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Generate market.json
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node scripts/generate-market.js

      - name: Commit and push if changed
        run: |
          git config user.name  "DealBrief Bot"
          git config user.email "actions@github.com"
          git add data/market.json
          if git diff --staged --quiet; then
            echo "No changes to commit."
          else
            git commit -m "Market snapshot: $(date -u +'%Y-%m-%d %H:%M UTC')"
            git push
          fi
```

- [ ] **Step 2: Validate YAML syntax**

Run (uses Python's standard library, present on any dev machine or CI runner — no new dependency; skip this exact command if Python isn't available locally and rely on step 3's real dispatch instead):
```
python -c "import yaml, sys; yaml.safe_load(open('.github/workflows/market-update.yml'))" 2>$null; if ($?) { 'YAML OK' }
```
Expected: no exception raised (or, if `pyyaml` isn't installed, skip and confirm visually that indentation matches the block above exactly).

- [ ] **Step 3: Commit and push, then trigger a real run**

```bash
git add .github/workflows/market-update.yml
git commit -m "Add market-update workflow (3x/day intraday refresh)"
git push origin main
```

Then manually trigger it: GitHub repo → **Actions** tab → **Update Market Snapshot** → **Run workflow** → **Run workflow**.

- [ ] **Step 4: Verify the run**

Watch the run complete (~30-60s). Confirm:
- The job succeeds (green check).
- `data/market.json` now exists in the repo with a `generated_at` timestamp from today and non-empty `ticker`/`market_snapshot.indices`.

---

### Task 6: Extend `generate-brief.js` — volume, opportunities schema, Speculative tier, bank rotation

**Files:**
- Modify: `scripts/generate-brief.js`
- Test: `tests/generate-brief-prompt.test.js`

**Interfaces:**
- Consumes: `recentlyCoveredBanks`, `pickRotationPriority`, `dropUnsourcedSpeculative` from `scripts/brief-helpers.js` (Task 3).
- Produces: an updated `data/daily.json` schema — opportunities now include `source`, `source_url`, `published`, `confidence`; stories/opportunities may carry `confidence: "Speculative"`.

- [ ] **Step 1: Write a failing regression test for the prompt content**

Since `SYSTEM_PROMPT` is a template string (not independently testable business logic), guard it with a substring test so a future edit can't silently drop the new requirements.

Create `tests/generate-brief-prompt.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scripts/generate-brief.js', import.meta.url), 'utf8');

test('prompt requires roughly doubled story/opportunity volume', () => {
  assert.match(source, /10 to 14 stories/);
  assert.match(source, /6 to 10 opportunities/);
});

test('prompt defines the Speculative confidence tier with a real-source requirement', () => {
  assert.match(source, /"Speculative"/);
  assert.match(source, /real article that itself reports the (rumor|speculation)/);
});

test('prompt requires opportunities to carry source fields', () => {
  assert.match(source, /"source_url"/);
  assert.match(source, /"published"/);
});

test('generate-brief.js wires in the bank-rotation and speculative-drop helpers', () => {
  assert.match(source, /from '\.\/brief-helpers\.js'/);
  assert.match(source, /dropUnsourcedSpeculative/);
  assert.match(source, /pickRotationPriority/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/generate-brief-prompt.test.js`
Expected: FAIL — none of the new strings exist in `generate-brief.js` yet.

- [ ] **Step 3: Add the archive-reading / rotation-priority block**

In `scripts/generate-brief.js`, change the import line (currently line 18):

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
```

to:

```js
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { recentlyCoveredBanks, pickRotationPriority, dropUnsourcedSpeculative } from './brief-helpers.js';
```

Then, immediately after the existing bank-loading block (currently lines 36-37):

```js
const banks = JSON.parse(readFileSync(join(ROOT, 'data/banks.json'), 'utf8')).banks;
const bankNames = banks.map(b => b.name);
```

insert:

```js

// ── Read recent archive editions to steer bank rotation ────────
// Bulge brackets stay the default priority, but smaller banks not
// covered in the last few editions get an explicit rotation slot
// so they aren't crowded out day after day.
let rotation = { bulgeBracket: [], dueForCoverage: [] };
try {
  const archiveDir = join(ROOT, 'data/archive');
  const files = readdirSync(archiveDir).filter(f => f.endsWith('.json')).sort().slice(-5);
  const recentEditions = files.map(f => JSON.parse(readFileSync(join(archiveDir, f), 'utf8')));
  const covered = recentlyCoveredBanks(recentEditions);
  rotation = pickRotationPriority(banks, covered);
} catch (err) {
  console.warn('Could not read archive for bank rotation, proceeding without it:', err.message);
}
```

- [ ] **Step 4: Replace `SYSTEM_PROMPT` with the updated volume/schema/rotation/speculation version**

Replace the entire existing `SYSTEM_PROMPT` template literal (currently lines 43-141, from `const SYSTEM_PROMPT = ` through the closing backtick before `const USER_PROMPT`) with:

```js
const SYSTEM_PROMPT = `You are the lead intelligence analyst for DealBrief, a daily sales-intelligence
brief for SS&C Intralinks Account Executives who sell virtual data rooms to investment banks
running M&A, capital markets, and restructuring processes.

Your job: produce today's brief as a single JSON object. Use web search aggressively to find
REAL news published in the LAST 24 HOURS (today's date is ${TODAY}). Treat anything older than
48 hours as stale — only include older items if they are still the active story (e.g. a pending
deal moving to a new stage). Focus on the banks this desk covers:

${bankNames.join(', ')}

BANK ROTATION: bulge bracket banks (${rotation.bulgeBracket.join(', ')}) are the default priority —
they realistically have the most daily deal activity. But you MUST include at least 1-2 stories
and at least 1 opportunity from these currently under-covered smaller banks, favoring ones that
haven't appeared in recent editions: ${rotation.dueForCoverage.join(', ')}. Smaller banks deserve
a real, recurring presence — don't let bulge brackets crowd them out entirely.

WHERE TO SEARCH (in priority order — run multiple searches, do not stop at one):
1. Wire services — Business Wire, PR Newswire, GlobeNewswire. Deal announcements appear here
   first and name the financial advisors in the release. Best fast confirmation.
2. Reuters and Bloomberg deal/M&A coverage — break most large-cap transactions.
3. M&A trade desks — ION Analytics / Mergermarket, The Deal, Axios Pro Rata — built for
   who-is-advising-whom.
4. The banks' own newsrooms / "recent transactions" pages (e.g. Goldman, Morgan Stanley,
   Evercore, Houlihan Lokey) — same-day, authoritative on their own mandates.
5. CNBC, WSJ, FT — for the macro and market-context layer (Fed, rates, market moves).
6. For SPECULATIVE pipeline items: rumor-reporting coverage (e.g. "sources say", "exploring
   strategic alternatives", "hired an adviser") from Reuters, Bloomberg, or trade press.

Run a search for the major active banks by name plus "advised" or "financial advisor", a
separate macro search for today's market and Fed news, and a rumor/pipeline search per the
rotation list above. Aim for breadth across several banks.

For every item, the lens is always: "Does this create a reason for an Intralinks AE to reach
out to this bank's deal team today?" Tie everything back to data room / diligence / deal-process
needs. Be specific and factual. Do not invent deals — if you cannot verify a claim via search,
do not include it. Every story's and every opportunity's source_url must be a real article you
actually found in search; if you can't back an item with a real, checkable link, drop it rather
than include it.

Return ONLY a JSON object (no markdown, no backticks, no preamble) with this exact schema:

{
  "date": "${TODAY}",
  "edition": <integer, increment-friendly>,
  "lens": "<one editorial sentence framing today's theme>",
  "ticker": [ { "label": "S&P 500", "value": "...", "change": "...", "positive": true } ],
  "stories": [
    {
      "id": "s1",
      "category": "MACRO|M&A|DEALS|BANKING|RESTRUCTURING|REGULATORY",
      "urgency": "HIGH|MEDIUM|LOW",
      "scope": "market|bank",
      "bank": "<exact bank name from the list, or omit if scope is market>",
      "headline": "...",
      "why_it_matters": "...",
      "suggested_action": "...",
      "deal_clock": [ { "date": "Jun 19", "event": "..." } ],
      "source": "...",
      "source_url": "https://...",
      "published": "YYYY-MM-DD (the article's publication date)",
      "confidence": "Filed|Reported|Speculative"
    }
  ],
  "opportunities": [
    {
      "id": "o1",
      "bank": "<exact bank name from the list>",
      "sector": "...",
      "urgency": "HOT|WARM",
      "headline": "...",
      "why_it_matters": "...",
      "deal_clock": [ { "date": "...", "event": "..." } ],
      "outreach_idea": "...",
      "outreach_draft": { "subject": "...", "body": "..." },
      "source": "...",
      "source_url": "https://...",
      "published": "YYYY-MM-DD (the article's publication date)",
      "confidence": "Filed|Reported|Speculative"
    }
  ],
  "market_snapshot": {
    "indices": [ { "label": "S&P 500", "value": "...", "change": "...", "positive": true } ],
    "bank_stocks": [ { "ticker": "GS", "price": "...", "change": "...", "positive": true } ],
    "macro_note": "..."
  },
  "talking_point": { "quote": "...", "use_with": "...", "context": "..." },
  "archive": []
}

Rules:
- FRESHNESS: set "published" to each article's real publication date. Prioritize items
  published today or yesterday. Do not include anything older than 48 hours unless it is a
  still-active deal that advanced to a new stage. Lead with the freshest, highest-impact items.
- 10 to 14 stories. Tag each "scope": "market" (macro/regulatory, no bank) or "scope": "bank"
  (tied to one covered bank, set "bank" to its exact name).
- Aim for at least 8 bank-specific stories spread across different banks, per the BANK ROTATION
  instruction above, so coverage filtering has real variety.
- 6 to 10 opportunities, each tied to a covered bank, each with a ready-to-send outreach_draft
  AND a real source/source_url/published — an opportunity with no verifiable link must be dropped.
- CONFIDENCE TAGGING: every bank-scoped story and every opportunity must carry a "confidence"
  field.
  * Use "Filed" ONLY for mandates that appear in the VERIFIED FILED MANDATES block
    below (these come from SEC filings and are authoritative — a rep can quote them).
  * Use "Reported" for anything sourced from confirmed news/web search that is not in that block.
  * Use "Speculative" ONLY when a real published article itself reports a rumor or pipeline
    possibility (e.g. "sources say", "exploring a sale", "hired an adviser") — never from your
    own inference alone. A "Speculative" item still requires a real, checkable source_url.
  * Prefer "Filed" mandates first when choosing bank stories. Market-scoped stories
    may omit confidence.
- Do NOT relabel a "Reported" item as "Filed", or an unsourced guess as "Speculative". The
  distinction is the whole point: reps verify "Reported" and "Speculative" items before quoting
  them on a call, and "Speculative" items should be framed to the rep as unconfirmed.
- Use real market data from search for ticker and market_snapshot. Pull the most recent close
  for major indices (S&P 500, Nasdaq, Dow, Russell 2000), the 10Y and 2Y Treasury yields, VIX,
  and WTI crude, plus current prices for the major bank stocks (GS, MS, JPM, EVR, LAZ, JEF).
  ACCURACY IS CRITICAL: if you cannot verify a number from search, omit that item entirely
  rather than estimate — an empty/short ticker is better than a wrong one.
- Keep "archive" as an empty array; the site manages history separately.
- Output must be valid JSON and nothing else.`;
```

- [ ] **Step 5: Wire `dropUnsourcedSpeculative` into the validation step**

In `scripts/generate-brief.js`, find the existing required-fields validation block (currently lines 219-227):

```js
  // ── Validate the essentials before writing ──
  const required = ['date', 'lens', 'stories', 'opportunities', 'market_snapshot', 'talking_point'];
  const missing = required.filter(k => !(k in brief));
  if (missing.length) {
    throw new Error(`Generated brief is missing fields: ${missing.join(', ')}`);
  }
  if (!Array.isArray(brief.stories) || brief.stories.length === 0) {
    throw new Error('Generated brief has no stories.');
  }
```

Add immediately after it:

```js

  // Drop any Speculative-tagged item that isn't backed by a real source —
  // an unsourced rumor must never ship.
  const cleaned = dropUnsourcedSpeculative(brief);
  brief.stories = cleaned.stories;
  brief.opportunities = cleaned.opportunities;
```

- [ ] **Step 6: Run the prompt regression test to verify it passes**

Run: `node --test tests/generate-brief-prompt.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 7: Run the full test suite to confirm no regressions**

Run: `node --test tests/`
Expected: PASS — all tests across `utils.test.js`, `brief-helpers.test.js`, `generate-market.test.js`, `generate-brief-prompt.test.js`.

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-brief.js tests/generate-brief-prompt.test.js
git commit -m "Double brief volume, add opportunities source fields, Speculative tier, bank rotation"
```

---

### Task 7: Add CSS for the confidence badges

**Why:** `today.js` already references `badge-conf-${confidence.toLowerCase()}` classes (for the existing "Filed"/"Reported" tags), but neither is actually defined in `main.css` — they've been rendering with no color coding at all. Fixing that alongside adding the new "Speculative" style keeps all three consistent in one place.

**Files:**
- Modify: `assets/css/main.css` (insert after the existing `.badge-market` block, currently ending at line 612, before the `/* Context line... */` comment at line 614)

- [ ] **Step 1: Add the badge styles**

Insert after line 612 (`}` closing `.badge-market`):

```css

.badge-conf-filed {
  background: rgba(74, 144, 201, 0.10);
  color: #4A90C9;
  border: 1px solid rgba(74, 144, 201, 0.25);
}

.badge-conf-reported {
  background: rgba(138, 148, 166, 0.10);
  color: var(--text-secondary);
  border: 1px solid rgba(138, 148, 166, 0.2);
}

.badge-conf-speculative {
  background: rgba(155, 111, 201, 0.12);
  color: #9B6FC9;
  border: 1px solid rgba(155, 111, 201, 0.25);
}
```

- [ ] **Step 2: Verify by eye**

Open `index.html` locally in a browser (or via a quick local static server, e.g. `python -m http.server 8000` from the repo root, then visit `http://localhost:8000`), and confirm the page still loads with no CSS parse errors (check the browser console). Full visual confirmation of the new badge colors happens in Task 9 once real "Speculative"/"Filed"/"Reported" data exists.

- [ ] **Step 3: Commit**

```bash
git add assets/css/main.css
git commit -m "Add badge-conf-filed/reported/speculative styles"
```

---

### Task 8: Wire market.json into `today.js` — fetch, freshness merge, polling, opportunity source links

**Files:**
- Modify: `assets/js/today.js`

**Interfaces:**
- Consumes: `fetchDataFresh`, `isMarketDataFresh`, `confidenceTooltip` from `assets/js/utils.js` (Task 2). Reads `data/market.json` written by Task 4/5's automation.

- [ ] **Step 1: Update the import line**

Replace line 6:

```js
import { fetchData, esc, urgencyToBadgeType, isMyBank, copyToClipboard, formatDate, getPrefs } from './utils.js';
```

with:

```js
import { fetchData, fetchDataFresh, isMarketDataFresh, confidenceTooltip, esc, urgencyToBadgeType, isMyBank, copyToClipboard, formatDate, getPrefs } from './utils.js';
```

- [ ] **Step 2: Add the market-data loader and poller**

Insert after the `initToday` function (currently ending at line 21, right before the `renderBrief` function):

```js

const MARKET_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch data/market.json and, if it's fresher than today's embedded
 * ticker/market_snapshot, re-render just those two sections.
 */
async function loadMarketData() {
  if (!dailyData) return;
  try {
    const market = await fetchDataFresh('market.json');
    if (isMarketDataFresh(dailyData.date, market.generated_at)) {
      renderTicker(market.ticker);
      renderMarketSnapshot(market.market_snapshot);
    }
  } catch (err) {
    // Background enhancement only — fall back silently to daily.json's
    // already-rendered embedded ticker/market_snapshot.
  }
}

/** Start polling data/market.json so an open tab picks up intraday refreshes. */
function startMarketPolling() {
  setInterval(loadMarketData, MARKET_POLL_INTERVAL_MS);
}
```

- [ ] **Step 3: Call the loader/poller from `initToday`**

Replace the existing `initToday` function (currently lines 14-21):

```js
export async function initToday() {
  try {
    dailyData = await fetchData('daily.json');
    renderBrief(dailyData, { archived: false });
  } catch (err) {
    console.error('Failed to load daily data:', err);
  }
}
```

with:

```js
export async function initToday() {
  try {
    dailyData = await fetchData('daily.json');
    renderBrief(dailyData, { archived: false });
    await loadMarketData();
    startMarketPolling();
  } catch (err) {
    console.error('Failed to load daily data:', err);
  }
}
```

- [ ] **Step 4: Use `confidenceTooltip` in `renderStories`**

Replace the confidence badge line in `renderStories` (currently line 207):

```js
              ${story.confidence ? `<span class="badge badge-conf-${story.confidence.toLowerCase()}" title="${story.confidence === 'Filed' ? 'From an SEC filing — authoritative' : 'From news — verify before quoting'}">${esc(story.confidence.toUpperCase())}</span>` : ''}
```

with:

```js
              ${story.confidence ? `<span class="badge badge-conf-${story.confidence.toLowerCase()}" title="${confidenceTooltip(story.confidence)}">${esc(story.confidence.toUpperCase())}</span>` : ''}
```

- [ ] **Step 5: Add the confidence badge and source link to `renderOpportunities`**

Replace the badges block in `renderOpportunities` (currently lines 302-305):

```js
            <div class="card-badges">
              <span class="badge badge-${urgencyType}">${esc(opp.urgency)}</span>
              ${myBank ? '<span class="badge badge-your-bank">YOUR BANK</span>' : ''}
            </div>
```

with:

```js
            <div class="card-badges">
              <span class="badge badge-${urgencyType}">${esc(opp.urgency)}</span>
              ${myBank ? '<span class="badge badge-your-bank">YOUR BANK</span>' : ''}
              ${opp.confidence ? `<span class="badge badge-conf-${opp.confidence.toLowerCase()}" title="${confidenceTooltip(opp.confidence)}">${esc(opp.confidence.toUpperCase())}</span>` : ''}
            </div>
```

Replace the empty footer-left div (currently line 326):

```js
            <div class="card-footer-left"></div>
```

with:

```js
            <div class="card-footer-left">
              ${opp.source_url ? `<a href="${esc(opp.source_url)}" target="_blank" rel="noopener" class="source-link">${esc(opp.source)} ↗</a>` : ''}
              ${opp.published ? `<span class="source-date">${esc(opp.published)}</span>` : ''}
            </div>
```

- [ ] **Step 6: Manual verification**

Serve the site locally (`python -m http.server 8000` from the repo root) and open `http://localhost:8000` in a browser:
- Confirm the page loads with no console errors.
- Confirm opportunities that have `source_url` in `data/daily.json` show a clickable source link (note: today's checked-in `data/daily.json` predates this schema change and has no `source_url` on opportunities, so the link simply won't render there — that's expected until the next automated run produces the new fields).
- In the browser console, run `localStorage.getItem('dealbrief_prefs')` to confirm prefs still load correctly (no regression to the existing "My Bank" filtering).

- [ ] **Step 7: Commit**

```bash
git add assets/js/today.js
git commit -m "Merge market.json into Today page with freshness check, polling, and opportunity source links"
```

---

### Task 9: End-to-end verification and final integration pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `node --test tests/`
Expected: PASS — every test file from Tasks 2-6, 0 failures.

- [ ] **Step 2: Regression-check the existing daily brief**

GitHub repo → **Actions** → **Generate Daily Brief** → **Run workflow** → **Run workflow**. Confirm:
- The job succeeds.
- `data/daily.json` updates with `edition` incremented by 1 from its prior value, and the prior edition is archived to `data/archive/<prior-date>.json` (unchanged behavior from before this plan).
- The new `data/daily.json` has 10-14 stories, 6-10 opportunities, and at least one opportunity with populated `source`/`source_url`/`published`/`confidence` fields.

- [ ] **Step 3: Confirm the market snapshot automation**

GitHub repo → **Actions** → **Update Market Snapshot** → **Run workflow** → **Run workflow**. Confirm the job succeeds and `data/market.json`'s `generated_at` timestamp updates.

- [ ] **Step 4: Confirm rotation and Speculative tagging in a live run**

Inspect the freshly generated `data/daily.json` from Step 2:
- Confirm at least one story or opportunity's `bank` is a boutique/middle-market bank (not bulge bracket) that wasn't in the previous 5 archived editions.
- If any item is tagged `"Speculative"`, confirm it has a real, non-empty `source_url`.

- [ ] **Step 5: Confirm graceful fallback when market.json is unavailable**

Locally, temporarily rename `data/market.json` to `data/market.json.bak`, serve the site (`python -m http.server 8000`), and open the Today page. Confirm it still renders the ticker/market snapshot from `daily.json`'s embedded data with no console errors. Restore the file afterward (`mv data/market.json.bak data/market.json` or the Windows equivalent) — do not commit this temporary rename.

- [ ] **Step 6: Confirm live polling picks up a refresh without reload**

With the site open in a browser tab, manually edit `data/market.json` locally (bump `generated_at` to the current moment and tweak a ticker value), and confirm the open tab's ticker updates within 5 minutes without a manual reload. Revert the manual edit afterward (it will be overwritten by the next real automated run regardless).

- [ ] **Step 7: Final commit**

If Steps 1-6 required any fixes, commit them now:

```bash
git add -A
git commit -m "Final verification fixes for live market updates and bank coverage"
git push origin main
```

If no fixes were needed, this task requires no commit — the feature is complete as of Task 8.
