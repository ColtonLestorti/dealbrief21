# DealBrief
**Daily Intelligence Platform · Banking & Capital Advisory**

Built for SS&C Intralinks Account Executives. Helps AEs prepare for client conversations in under five minutes.

Live site: https://coltonlestorti.github.io/dealbrief21/

---

## What it does

Every weekday morning, DealBrief gives AEs a fast read on:
- **Today** — the market lens, a live ticker, top stories (Fed/macro + the biggest deals), opportunities tied to your banks, a market snapshot, and a talking point. Filters to your selected banks plus the market-wide headlines everyone should know.
- **My Banks** — your covered banks, each with recent sourced news, deals, and ready talking points.
- **Deals** — searchable, filterable deal tracker; each deal has a one-click outreach draft.
- **Industry Reports** — current M&A outlooks and league tables from Goldman, Morgan Stanley, PwC, Bain, Deloitte, ION, and A&O Shearman, each linking to the real report.
- **Archive** — every past edition is saved and viewable. Click any edition on the Today page to read that day's brief.

## Content model

Every card follows the same schema: **Headline → Why it Matters → Suggested Action → Source link**. Stories are tagged `scope: "market"` (macro/deals everyone sees) or `scope: "bank"` (tied to one covered bank, shown only to AEs who cover it).

## Data & freshness

- **Market numbers (ticker + snapshot)** and **editorial (stories, deals, bank news)** are refreshed each weekday morning by the automation pipeline (GitHub Actions + Claude API). See `docs/AUTOMATION.md` for setup.
- The current files are a **real, hand-built, sourced baseline** (June 2026). Every bank has at least one sourced news item; every report links to a real document.
- Editions are numbered from **#1 = Thursday, June 18, 2026**. (June 19 was Juneteenth — US markets closed — so the next edition is #2 on Monday, June 22.)

## Tech

Vanilla HTML / CSS / JS. JSON data files. No build step, no external runtime dependencies. Hosted on GitHub Pages.

## Structure

```
dealbrief/
├── index.html
├── README.md
├── .github/workflows/daily-brief.yml   # weekday automation
├── scripts/generate-brief.js           # daily brief generator (Claude API)
├── docs/AUTOMATION.md                  # setup guide
├── assets/
│   ├── css/main.css
│   └── js/{app,today,pages,onboarding,utils}.js
└── data/
    ├── daily.json                      # today's live edition
    ├── banks.json                      # 28-bank coverage universe
    ├── deals.json
    ├── resources.json                  # industry reports
    └── archive/                        # past editions (one file per day)
        └── 2026-06-18.json
```

## Editing content by hand

- Add or correct a bank's news: edit `data/banks.json`.
- Add a deal: edit `data/deals.json` (give it a unique `id` and an `outreach_draft`).
- Add a report: edit `data/resources.json`.
- Tweak today's brief: edit `data/daily.json`.

Bank names in `data/banks.json` must match the names in `assets/js/onboarding.js` exactly, or coverage filtering won't match.
