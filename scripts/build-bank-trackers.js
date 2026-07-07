#!/usr/bin/env node
/* ============================================================
   build-bank-trackers.js
   Enriches data/banks.json with a per-bank `dealbrief_tracker`:
     - mandates_30d / mandates_total  (computed from editions)
     - advisory_signal   (league-table rank / revenue, period-labeled)
     - next_earnings      (Q2 2026 report date — a seller timing hook)
     - pipeline_watch[]   (prospective/rumored deals; Speculative)

   Honesty guardrails:
     - Counts are "tracked by DealBrief", NOT an official league table.
       They structurally undercount bulge brackets; advisory_signal.rank
       supplies the authoritative context.
     - Pipeline items carry confidence:"Speculative" and a publisher+date
       citation. Where an article URL doesn't resolve cleanly (Google News
       redirects), source_note carries the publisher+date instead of a
       dead link — never a fabricated URL.

   Idempotent: rewrites the tracker block each run. Re-run after new
   editions to refresh counts:  node scripts/build-bank-trackers.js
   ============================================================ */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AS_OF = '2026-07-07';
const WINDOW_DAYS = 30;

/* ── 1. Tally tracked mandates per bank (same rule as tally-mandates.js) ── */
const cutoff = new Date(AS_OF);
cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

function sourceUrlOf(item) {
  return item.source_url || (item.outreach_draft && item.outreach_draft.source_url) || '';
}
function publishedOf(item, editionDate) {
  return item.published || (item.outreach_draft && item.outreach_draft.published) || editionDate;
}

const editionFiles = [];
try {
  const archiveDir = join(ROOT, 'data/archive');
  for (const f of readdirSync(archiveDir).filter(f => f.endsWith('.json')).sort()) {
    editionFiles.push(join(archiveDir, f));
  }
} catch { /* none */ }
editionFiles.push(join(ROOT, 'data/daily.json'));

const allTime = {}, window30 = {};
function record(map, bank, key) { if (!bank) return; (map[bank] = map[bank] || new Set()).add(key); }

for (const file of editionFiles) {
  let ed;
  try { ed = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
  for (const item of [...(ed.stories || []), ...(ed.opportunities || [])]) {
    if (!item.bank) continue;
    const url = sourceUrlOf(item);
    const key = item.bank + '|' + (url || (item.headline || item.id || '').slice(0, 50).toLowerCase());
    record(allTime, item.bank, key);
    const pd = new Date(publishedOf(item, ed.date));
    if (!isNaN(pd) && pd >= cutoff) record(window30, item.bank, key);
  }
}

/* ── 2. Researched advisory signals + earnings dates (period-labeled) ──
   League-table backbone (VERIFIED, resolves):
   ION Analytics / Mergermarket, "Goldman Sachs, JPMorgan top 1H26 M&A
   rankings as boards back boldness", 2026-07-01. */
const ION_URL = 'https://ionanalytics.com/insights/mergermarket/goldman-sachs-jpmorgan-top-1h26-ma-rankings-as-boards-back-boldness/';
const ION = { source: 'ION Analytics / Mergermarket', source_url: ION_URL, period: 'H1 2026', date: '2026-07-01' };

const SIGNALS = {
  'Goldman Sachs':      { rank: '#1 global M&A by value, H1 2026 (~$1.23T advised)', ...ION },
  'JPMorgan':           { rank: '#2 global M&A by value, H1 2026 (~$818.8B advised)', ...ION },
  'Morgan Stanley':     { rank: '#3 global M&A by value, H1 2026 (~$673.1B advised)', ...ION },
  'Lazard':             { rank: '#6 global M&A by value, H1 2026 (+111% YoY)', ...ION },
  'Centerview Partners':{ rank: '#9 global M&A by value, H1 2026', ...ION },
  'Houlihan Lokey':     { rank: '#3 global M&A by deal count, H1 2026', ...ION },
  'Jefferies':          { rank: 'IB net revenue $1.21B — a record, +53% YoY (fiscal Q2 2026, reported Jun 24)', source: 'StockTitan', source_url: 'https://www.stocktitan.net/', period: 'Fiscal Q2 2026', date: '2026-06-24' }
};

/* Confirmed Q2 2026 (calendar) earnings dates — a seller timing hook. */
const EARNINGS = {
  'JPMorgan': '2026-07-14', 'Goldman Sachs': '2026-07-14', 'Citi': '2026-07-14',
  'Bank of America': '2026-07-14', 'Wells Fargo': '2026-07-14',
  'Morgan Stanley': '2026-07-15', 'Lazard': '2026-07-23', 'Barclays': '2026-07-28',
  'Deutsche Bank': '2026-07-29', 'UBS': '2026-07-29'
};

/* Pipeline leads tied to a covered bank as named adviser.
   Verified headline+publisher+date; Google News redirect links don't
   resolve, so we cite publisher+date in source_note (no dead URL). */
const PIPELINE = {
  'Morgan Stanley': [
    { company: 'Bumble', situation: 'Reported to be working with Morgan Stanley to explore a sale amid a user decline', sector: 'Consumer internet', source_note: 'Moomoo / Market Chatter, Jun 25 2026', confidence: 'Speculative' },
    { company: 'Ryman Hospitality (Opry Entertainment Group)', situation: 'Exploring partnerships / strategic alternatives for its Opry Entertainment unit', sector: 'Entertainment / hospitality', source_note: 'Moomoo, Jun 25 2026', confidence: 'Speculative' }
  ],
  'Jefferies': [
    { company: 'CSA Group', situation: 'Reported to have tapped Jefferies to explore a sale', sector: 'Testing, inspection & certification', source_note: 'Bloomberg (headline-level), Jun 26 2026', confidence: 'Speculative' }
  ],
  'JPMorgan': [
    { company: 'Minted', situation: 'Reported to be exploring a potential ~$1B sale with JPMorgan', sector: 'E-commerce / consumer', source_note: 'GuruFocus, Jun 29 2026', confidence: 'Speculative' }
  ]
};

const TRACKER_NOTE = 'Mandates tracked by DealBrief from public news — a coverage tally, not an official league table. Bulge brackets are undercounted; see advisory_signal for authoritative rank.';

/* ── 3. Write the tracker into each bank ── */
const banksDoc = JSON.parse(readFileSync(join(ROOT, 'data/banks.json'), 'utf8'));
let enriched = 0;
for (const bank of banksDoc.banks) {
  const t30 = (window30[bank.name] && window30[bank.name].size) || 0;
  const tAll = (allTime[bank.name] && allTime[bank.name].size) || 0;
  const signal = SIGNALS[bank.name] || null;
  const earnings = EARNINGS[bank.name] || null;
  const pipeline = PIPELINE[bank.name] || [];

  // Skip banks with nothing to add (no tracked deals, no signal, no pipeline).
  if (t30 === 0 && tAll === 0 && !signal && !earnings && pipeline.length === 0) {
    delete bank.dealbrief_tracker;
    continue;
  }

  bank.dealbrief_tracker = {
    mandates_30d: t30,
    mandates_total: tAll,
    as_of: AS_OF,
    note: TRACKER_NOTE,
    advisory_signal: signal,
    next_earnings: earnings,
    pipeline_watch: pipeline
  };
  enriched++;
}

writeFileSync(join(ROOT, 'data/banks.json'), JSON.stringify(banksDoc, null, 2) + '\n');
console.log(`Enriched ${enriched} banks with dealbrief_tracker (as of ${AS_OF}).`);
