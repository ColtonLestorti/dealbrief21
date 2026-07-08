# DealBrief Source List

The research inputs for each edition — what to sweep, how to fetch it, and how to cite it. Used two ways:

1. **Manual editions** (current mode, while API automation is paused) — the research pass works through this list.
2. **Automation** (when re-enabled) — `generate-brief.js` / `generate-market.js` can be pointed at these feeds so the paid API summarizes/ranks pre-fetched headlines instead of doing open-ended (expensive) web search.

## Sourcing rules (non-negotiable)

- **Every published item needs a real source.** No invented deals, no fabricated URLs. (See `README.md`.)
- **Confidence tags:** `Filed` (SEC filing), `Reported` (confirmed news), `Speculative` (a real article reporting a rumor). Speculative still needs a real source.
- **When a link doesn't resolve** (e.g. Google News redirect links), cite **publisher + date** in the source line instead of shipping a dead URL.

## Fetchability cheat-sheet (verified 2026-07-07)

| Source | Fetchable? | Use for |
|---|---|---|
| **Google News RSS** (`news.google.com/rss/search?q=...&when:Nd`) | ✅ Best discovery tool | Finding dated, attributed headlines on any topic |
| Investing.com | ✅ Article bodies load | Verifying macro/market details |
| StockTitan | ✅ Loads | Deal press releases, IPO syndicates, earnings |
| PR Newswire / Business Wire | ✅ Loads (sometimes via aggregators) | Deal announcements naming advisors |
| Yahoo Finance | ✅ Quotes; ⚠️ some article pages 404 | Index / stock levels |
| ION Analytics | ✅ Insights pages load (some premium) | M&A league tables |
| SEC EDGAR | ✅ Loads | S-1 / 424(b) filings ("Filed" confidence) |
| **Reuters / Bloomberg / CNBC / WSJ / MarketWatch** | ❌ Article bodies blocked (403/404) | Verify at RSS-headline level, cross-check ≥2 publishers |

## Macro / market sweep (each edition)

Run Google News RSS across these themes, then verify details on a loadable source:
- Fed / interest rates / FOMC
- Jobs & inflation (payrolls, CPI, PCE)
- Equity moves & sector rotations; chip/AI sentiment
- Credit markets / bond issuance / leveraged finance
- IPO & M&A market conditions
- Oil / commodities / tariffs / geopolitics

## Deal & pipeline sweep (each edition)

- **Announced mandates:** wire services + Reuters/Bloomberg naming advisors from the 28 covered banks (see `banks.json`).
- **Pipeline / prospective:** search `"exploring strategic alternatives"`, `"hired an adviser"`, `"exploring a sale"`, `"takeover approach"`, `"in talks to acquire"`, `"activist stake"`. Tag `Speculative`; capture the adviser only if named.
- **Per-bank counts:** `scripts/tally-mandates.js` (tracked-mandate tally across editions).
- **Advisory signals / league tables:** public ION Analytics insight articles (`ionanalytics.com/insights/...`), LSEG, Private Banker International, FactSet Flashwire (public PDF). Label with the period covered. (The paywalled Mergermarket database itself is a lead-only source — see Subscription sources below.)
- **Bank earnings:** quarterly IB/advisory revenue + pipeline commentary (a seller timing hook). Confirmed Q2 2026 dates live in each bank's `dealbrief_tracker.next_earnings`.

## Podcasts & newsletters

Audio podcasts can't be scraped directly — only their **text equivalents** (newsletter, show notes, transcript) are usable.

| Source | Type | Fetchable text? | How to use |
|---|---|---|---|
| **Morning Brew Daily** | Newsletter + podcast | ✅ Yes — site/newsletter articles surface in Google News RSS | Fold relevant market/deal items in; cite `Morning Brew, <date>` |
| **Wall Street Breakfast** (Seeking Alpha) | Daily podcast | ⚠️ Partial — podcast RSS (`seekingalpha.com/feed/podcast/wall-street-breakfast.xml`) gives **episode titles + dates only, no body**. Sibling text pieces (Wall Street **Lunch / Brunch / Week Ahead**) DO carry text | Use episode titles as a topic signal to chase; verify content elsewhere. Pull text from the Lunch/Brunch/Week-Ahead articles when relevant |
| **The Market Maker** (Amplify Me — Anthony Cheung / Piers Curran) | Markets-education podcast | ❌ No — audio-only (Spotify / Apple / YouTube), no reliable fetchable transcript; does not surface in news search | **Manual-listen source.** User flags anything relevant → fold in with an attribution note. Cannot be automated |

### Podcast feed URLs (for reference / future automation)
- Wall Street Breakfast podcast RSS: `https://seekingalpha.com/feed/podcast/wall-street-breakfast.xml`
- Morning Brew: discover via `news.google.com/rss/search?q=%22Morning+Brew%22+markets&when:3d`

## Subscription sources (PitchBook, Mergermarket) — leads only, never republished

Paid, licensed subscriptions used by the team. They are the **best deal-discovery
tools available** — but the site is currently a **public** GitHub Pages page, and
these are licensed products (PitchBook = Morningstar; Mergermarket = ION Analytics).
So they are **research leads**, not publishable sources:

**The rule:**
1. A team member (with a seat) spots a lead in PitchBook / Mergermarket.
2. They hand it to the brief ("PitchBook shows Evercore advising X on Y").
3. The lead is **confirmed against a PUBLIC source** (press release, wire, SEC
   filing, public ION insight article) and published cited to *that* public source.
4. If no public confirmation exists, it does **not** ship (no-unsourced-deals rule) —
   the team can still use it in conversations offline.

**Never:** scrape either product (breaches their ToS — no seat gives web-scraping
rights), or republish raw subscription data (deal records, valuations, league-table
extracts) on the public site (redistribution breach). The subscription tool points
the research; it never appears as a `source`.

| Source | What's usable | What's off-limits |
|---|---|---|
| **PitchBook** (Morningstar) | Manual research lead only (web seat, no API) | Scraping; republishing any PitchBook data on the public site |
| **Mergermarket** (ION Analytics) | Manual research lead from the paid database; **public** ION insight articles at `ionanalytics.com/insights/...` are citable | Scraping the deal database; republishing paywalled records |

> If the site is ever moved behind auth / SS&C-internal hosting, displaying licensed
> data *may* become possible within each product's license — but that needs SS&C
> compliance/legal sign-off first, and is out of scope while the site is public.

## When automation resumes (cost note)

The cheap pattern: fetch headlines from these RSS feeds in Node **for free**, then pay the Claude API only to *summarize and rank* them — instead of the current "let Claude web-search the whole open internet" approach (the main cost driver). See `daily-brief.yml` / `market-update.yml` (schedules currently commented out).
