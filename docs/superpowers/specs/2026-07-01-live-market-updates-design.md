# Live Market Updates & Deeper Bank Coverage — Design

**Date:** 2026-07-01
**Status:** Approved, ready for implementation planning

## Goal

Extend DealBrief (not a new system) so that:
1. Market numbers (ticker, indices, bank stocks) refresh several times a day, not just once each morning.
2. The daily brief's stories/opportunities are more thorough: every covered bank gets a fair, weighted shot at coverage over time, every claim is backed by a real link, and genuine pipeline speculation is surfaced (clearly labeled) instead of only confirmed news.
3. The existing per-device "My Bank" experience (already implemented) is preserved and slightly extended (source links on opportunities) rather than replaced.

Constraints carried over from the existing project: fully static site on GitHub Pages, GitHub Actions for all automation, no backend/auth, no new paid vendor beyond the existing Anthropic API usage.

## Architecture & Data Flow

Two fully independent scheduled automations:

```
Existing, unchanged:
  Weekday ~6 AM ET → scripts/generate-brief.js → full stories+opportunities brief
                    → writes data/daily.json, archives prior edition

New:
  Weekday ~9:35 AM / 12:30 PM / 4:15 PM ET
        → scripts/generate-market.js (lightweight Claude + web search;
          ticker/indices/bank-stocks/macro_note ONLY — no stories, no
          opportunities, no edition/archive logic)
        → writes data/market.json (includes a generated_at ISO timestamp)
        → commits only if changed
```

`data/market.json` is a new, independent file (Approach A from design discussion) rather than in-place edits to `daily.json`. This keeps the two automations fully decoupled — the market job can never affect stories, opportunities, edition numbers, or archiving, and each script stays single-purpose.

### `data/market.json` schema

```json
{
  "generated_at": "2026-07-01T16:35:00Z",
  "ticker": [ { "label": "S&P 500", "value": "...", "change": "...", "positive": true } ],
  "market_snapshot": {
    "indices": [ { "label": "S&P 500", "value": "...", "change": "...", "positive": true } ],
    "bank_stocks": [ { "ticker": "GS", "price": "...", "change": "...", "positive": true } ],
    "macro_note": "..."
  }
}
```

### Front-end integration

- `today.js` fetches `daily.json` first (stories, opportunities, talking point, and its embedded `ticker`/`market_snapshot` as a same-day fallback).
- It then fetches `data/market.json`. **Freshness check before overriding:** only use `market.json`'s `ticker`/`market_snapshot` if its `generated_at` date matches `daily.json`'s `date` field (i.e. it's actually been refreshed today). Otherwise — e.g. in the ~6:00–9:35 AM window before the first intraday refresh has run, when `market.json` would still hold *yesterday's* 4:15 PM data — keep using `daily.json`'s embedded ticker, since that was just generated fresh at 6 AM and is newer than a stale prior-day `market.json`.
- A polling timer (~every 5 minutes) re-fetches `data/market.json` (cache-busted with a `?t=` query param) while the tab is open, re-running the same freshness check and re-rendering only the ticker and market-snapshot sections — stories/opportunities and scroll position are untouched.
- If the fetch 404s or fails (e.g. before the workflow has ever run, or a transient network error), fall back silently to `daily.json`'s embedded data. No error shown to the rep — this is a background enhancement, not a critical path.

## Content Rigor, Volume & Speculation (changes to `generate-brief.js`)

- **Volume:** roughly double today's output — target **10–14 stories / 6–10 opportunities** per run (from 5-8 / 3-6).
- **Opportunities gain a source link.** Add `source`, `source_url`, `published` fields to the opportunities schema, mirroring stories. Same rule: must be a real, verifiable article.
- **New `"Speculative"` confidence tier**, alongside existing `"Filed"` (SEC EDGAR) and `"Reported"` (confirmed news). Used for rumored/pipeline items (e.g. "sources say Company X is exploring a sale"). Rule: the model may only use this tag when a real published article itself reports the rumor — never from its own inference alone. `source_url` is still required and still must be real.
- **Bank weighting (not flat rotation):** the script reads the last ~5 archived editions and collects which banks already appeared. Bulge bracket banks remain the default priority (realistically the most active), but the prompt requires **at least 1–2 stories and at least 1 opportunity from Elite Boutique or Middle Market banks**, favoring ones absent from recent editions — so smaller banks get a real, recurring presence instead of being crowded out.
- **Tighter verification language:** explicitly instruct the model to drop any story/opportunity it can't back with a real source URL from its own search results, rather than only warning against invented deals.
- `banks.json`'s existing `type` field (Bulge Bracket / Elite Boutique / Middle Market) is the input for the weighting logic — no schema change needed there.

### Front-end change

`renderOpportunities` in `today.js` gets the same source-link footer `renderStories` already has (same pattern as the existing `story.source_url` rendering), and a distinct badge treatment for `"Speculative"`-tagged items so reps never mistake a rumor for a confirmed mandate.

Note: the existing "My Bank" badge and bank-prioritized filtering (`isMyBank`, the "YOUR BANK" badge, and the my-banks-first sort in `filterStories`) already exist on both stories and opportunities and are unchanged by this design — only the opportunities source-link and Speculative badge are new UI.

## Error Handling

- `generate-market.js` validates required fields (non-empty ticker, non-empty indices) before writing, same fail-loudly pattern as the existing brief script — an invalid/incomplete Claude response exits the job non-zero and the site keeps showing the last-good `market.json`.
- The bank-rotation history read (scanning recent archives) is wrapped in try/catch defaulting to empty history — a missing/empty archive folder won't crash the run (matches the existing edition/archive try/catch pattern already in `generate-brief.js`).
- Any story/opportunity tagged `"Speculative"` without a real `source_url` is dropped at validation time, before the file is written — an unsourced rumor can never ship.
- EDGAR lookup is unchanged (already fails soft, continuing web-search-only if EDGAR is down).
- Front-end market data fetch/poll failures are silent — fall back to `daily.json`'s embedded data, retry next interval, never surface an error to the rep for a background refresh.

## Testing / Verification

- Trigger both workflows manually via `workflow_dispatch`: confirm `data/market.json` is created/updated with a valid schema and `generated_at`, and confirm the existing daily brief workflow still runs unaffected (regression check on edition/archive logic).
- In a live generated run, confirm: opportunities render source links, a bank absent from the last few editions appears (rotation working), volume is roughly doubled, and any `"Speculative"`-tagged item shows the distinct badge with a working link.
- Remove/rename `data/market.json` locally and confirm the page still renders cleanly from `daily.json`'s fallback with no console errors.
- Open the site, edit/regenerate `market.json`, and confirm an already-open tab picks up the change within the polling interval without a manual reload.

## Explicitly Out of Scope (for this design)

- Real accounts/login or centrally-managed bank assignment (staying per-device/localStorage, per earlier decision).
- Guaranteed daily research of all 28 banks individually (staying with one strengthened shared-search process, per earlier decision).
- Baking specific "dealcentre AI" feature-messaging into outreach drafts (staying generic — deal relevance only, per earlier decision).
- Any further visual/UI polish beyond the source-link and Speculative badge additions — general "make it incredible" styling is an iterative, look-at-the-live-site concern for implementation time, not something to over-specify here.
