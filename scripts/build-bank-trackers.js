#!/usr/bin/env node
/* ============================================================
   build-bank-trackers.js
   Enriches data/banks.json with a per-bank `dealbrief_tracker`:
     - mandates_30d / mandates_total  (computed from editions — these are
       mandates DealBrief CAUGHT in its own coverage, not the bank's full book)
     - advisory_signal   (league-table rank / revenue, period-labeled)
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
// Recompute the mandate counts as of the latest edition on disk so the tracker
// doesn't silently freeze in the past. Override with --as-of YYYY-MM-DD.
const asOfArg = process.argv.includes('--as-of') ? process.argv[process.argv.indexOf('--as-of') + 1] : null;
const AS_OF = asOfArg || latestEditionDate() || new Date().toISOString().slice(0, 10);
const WINDOW_DAYS = 30;

/** Newest edition date across daily.json + archives (ISO string), or null. */
function latestEditionDate() {
  const dates = [];
  try {
    const d = JSON.parse(readFileSync(join(ROOT, 'data/daily.json'), 'utf8')).date;
    if (d) dates.push(d);
  } catch { /* ignore */ }
  try {
    for (const f of readdirSync(join(ROOT, 'data/archive')).filter(f => f.endsWith('.json'))) {
      dates.push(f.replace(/\.json$/, ''));
    }
  } catch { /* ignore */ }
  return dates.sort().pop() || null;
}

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

// Per-bank list of the actual caught mandates (deduped by the same key as the
// counts), so the "Mandates we caught (full list)" drawer shows the deals
// behind each number. bank -> Map(key -> mandate detail).
const caught = {};
function recordDetail(bank, key, detail) {
  if (!bank) return;
  const m = (caught[bank] = caught[bank] || new Map());
  // First write wins per key, but prefer a Filed entry over a Reported one and
  // keep the most recent published date if a later edition re-surfaced it.
  const prior = m.get(key);
  if (!prior) { m.set(key, detail); return; }
  if (prior.confidence !== 'Filed' && detail.confidence === 'Filed') m.set(key, { ...detail });
  if (detail.published > (prior.published || '')) prior.published = detail.published;
}

// An item's advising banks: multi-bank `banks: [...]` or legacy single `bank`.
function itemBanks(item) {
  const raw = Array.isArray(item.banks) ? item.banks
    : (item.banks ? [item.banks] : (item.bank ? [item.bank] : []));
  const seen = new Set(), out = [];
  for (const b of raw) {
    const name = String(b || '').trim();
    if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push(name); }
  }
  return out;
}

/* Coverage-team inference — mirrors coverageTeams() in assets/js/utils.js so the
   drawer's industry-group badges match the Today feed's. Token-aware to avoid
   false hits (e.g. "ai" inside "retail"). An explicit item.coverage_team wins. */
const COVERAGE_TEAMS = [
  { team: 'TMT', keywords: ['tech', 'software', 'saas', 'ai', 'artificial intelligence', 'cloud', 'data center', 'data-center', 'semiconductor', 'chip', 'media', 'telecom', 'telecommunication', 'internet', 'digital', 'fintech', 'payments', 'compute'] },
  { team: 'Healthcare', keywords: ['health', 'healthcare', 'biotech', 'biopharma', 'pharma', 'medtech', 'medical', 'device', 'life science', 'therapeutic', 'drug', 'clinical', 'regenerative', 'diagnostic'] },
  { team: 'FIG', keywords: ['bank', 'banking', 'financial services', 'financial institution', 'insurance', 'insurer', 'asset manager', 'wealth', 'exchange', 'market structure', 'brokerage', 'specialty finance', 'lending'] },
  { team: 'Energy & Power', keywords: ['energy', 'oil', 'gas', 'midstream', 'utility', 'utilities', 'power', 'renewable', 'renewables', 'clean power', 'royalty', 'pipeline', 'lng', 'solar', 'wind'] },
  { team: 'Consumer & Retail', keywords: ['consumer', 'retail', 'convenience', 'restaurant', 'food', 'beverage', 'apparel', 'grocery', 'e-commerce', 'ecommerce', 'marine', 'boat', 'auto retail', 'dealership'] },
  { team: 'Industrials', keywords: ['industrial', 'industrials', 'manufactur', 'materials', 'chemical', 'aerospace', 'defense', 'defence', 'machinery', 'engineering', 'inspection', 'thermal', 'building', 'transportation', 'shipping', 'logistics', 'automotive'] },
  { team: 'Real Estate', keywords: ['real estate', 'reit', 'property', 'realty', 'hospitality', 'lodging'] }
];
const COVERAGE_TEAM_ORDER = COVERAGE_TEAMS.map(t => t.team);

function keywordMatches(keyword, haystack, tokens) {
  if (/[ -]/.test(keyword)) return haystack.includes(keyword);
  if (keyword.length >= 4) return tokens.some(t => t.startsWith(keyword));
  return tokens.some(t => t === keyword || t === `${keyword}s`);
}

function coverageTeams(item) {
  if (!item) return ['M&A'];
  if (item.coverage_team) {
    const explicit = Array.isArray(item.coverage_team) ? item.coverage_team : [item.coverage_team];
    const cleaned = explicit.map(t => String(t).trim()).filter(Boolean);
    if (cleaned.length) return cleaned;
  }
  const haystack = [
    item.sector || '',
    Array.isArray(item.tags) ? item.tags.join(' ') : '',
    item.headline || ''
  ].join(' ').toLowerCase();
  const tokens = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  const matched = new Set();
  for (const { team, keywords } of COVERAGE_TEAMS) {
    if (keywords.some(kw => keywordMatches(kw, haystack, tokens))) matched.add(team);
  }
  if (matched.size === 0) return ['M&A'];
  return COVERAGE_TEAM_ORDER.filter(t => matched.has(t));
}

// Deal-level aggregate (deduped by deal, not per-bank) — powers the Deals page
// "All Deals" archive. dealKey -> merged deal row.
const CONF_RANK = { Filed: 0, Reported: 1, Speculative: 2 };
const deals = new Map();
function dealKeyOf(item, url) {
  // Prefer the source_url (same deal often appears as story + opp, and both
  // sides); fall back to a normalized headline so unsourced-but-real items still
  // collapse. Strip a leading bank/verb clause so "X advises A on B" and
  // "A's B deal" don't split — use the whole normalized headline; good enough
  // since same-deal items nearly always share a source_url.
  return (url || (item.headline || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
}
function recordDeal(item, banks, url, published) {
  const key = dealKeyOf(item, url);
  if (!key) return;
  const conf = item.confidence || 'Reported';
  const prior = deals.get(key);
  if (!prior) {
    deals.set(key, {
      headline: item.headline || '',
      banks: [...banks],
      published: published || '',
      confidence: conf,
      coverage_team: coverageTeams(item),
      sector: item.sector || '',
      source: item.source || '',
      source_url: url || ''
    });
    return;
  }
  // Merge: union banks (order-stable), best confidence, newest published,
  // richest coverage_team, keep a headline (prefer a story-style one w/ banks).
  const seen = new Set(prior.banks.map(b => b.toLowerCase()));
  for (const b of banks) if (!seen.has(b.toLowerCase())) { seen.add(b.toLowerCase()); prior.banks.push(b); }
  if ((CONF_RANK[conf] ?? 3) < (CONF_RANK[prior.confidence] ?? 3)) prior.confidence = conf;
  if ((published || '') > (prior.published || '')) prior.published = published;
  const ct = coverageTeams(item);
  if (ct.length > prior.coverage_team.length && ct[0] !== 'M&A') prior.coverage_team = ct;
  if (!prior.sector && item.sector) prior.sector = item.sector;
}

for (const file of editionFiles) {
  let ed;
  try { ed = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
  for (const item of [...(ed.stories || []), ...(ed.opportunities || [])]) {
    const banks = itemBanks(item);
    if (!banks.length) continue; // market-scoped items have no bank to credit
    const url = sourceUrlOf(item);
    const published = publishedOf(item, ed.date);
    const pd = new Date(published);
    const inWindow = !isNaN(pd) && pd >= cutoff;
    // Credit the mandate to EVERY advising bank on it (a co-advised deal counts
    // for each bank that worked it), keyed per-bank so no bank double-counts.
    for (const bank of banks) {
      const key = bank + '|' + (url || (item.headline || item.id || '').slice(0, 50).toLowerCase());
      record(allTime, bank, key);
      if (inWindow) record(window30, bank, key);
      recordDetail(bank, key, {
        headline: item.headline || '',
        published: published || ed.date || '',
        confidence: item.confidence || 'Reported',
        coverage_team: coverageTeams(item),
        source: item.source || '',
        source_url: url || ''
      });
    }
    // Deal-level: one row per unique deal, all advising banks merged.
    recordDeal(item, banks, url, published || ed.date || '');
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

const TRACKER_NOTE = 'Mandates DealBrief caught in its own coverage — not the bank\'s full book, and not an official league table. Bulge brackets are heavily undercounted; see advisory_signal for authoritative rank.';

/* ── 3. Write the tracker into each bank ── */
const banksDoc = JSON.parse(readFileSync(join(ROOT, 'data/banks.json'), 'utf8'));
let enriched = 0;
for (const bank of banksDoc.banks) {
  const t30 = (window30[bank.name] && window30[bank.name].size) || 0;
  const tAll = (allTime[bank.name] && allTime[bank.name].size) || 0;
  const signal = SIGNALS[bank.name] || null;
  const pipeline = PIPELINE[bank.name] || [];

  // Skip banks with nothing to add (no tracked deals, no signal, no pipeline).
  if (t30 === 0 && tAll === 0 && !signal && pipeline.length === 0) {
    delete bank.dealbrief_tracker;
    continue;
  }

  // The deals behind the counts, newest-first — powers the
  // "Mandates we caught (full list)" drawer. Length === mandates_total.
  const caughtList = caught[bank.name]
    ? [...caught[bank.name].values()].sort((a, b) => (b.published || '').localeCompare(a.published || ''))
    : [];

  bank.dealbrief_tracker = {
    mandates_30d: t30,
    mandates_total: tAll,
    as_of: AS_OF,
    note: TRACKER_NOTE,
    advisory_signal: signal,
    pipeline_watch: pipeline,
    caught_mandates: caughtList
  };
  enriched++;
}

writeFileSync(join(ROOT, 'data/banks.json'), JSON.stringify(banksDoc, null, 2) + '\n');
console.log(`Enriched ${enriched} banks with dealbrief_tracker (as of ${AS_OF}).`);

/* ── 4. Write the deal-level archive (data/deals.json) ──
   One row per unique deal DealBrief caught, newest-first, with every advising
   bank merged. Powers the "All Deals" page. Replaces the old hand-authored
   file (which was never updated). */
const dealList = [...deals.values()]
  .sort((a, b) => (b.published || '').localeCompare(a.published || ''))
  .map((d, i) => ({ id: `d${i + 1}`, ...d }));
writeFileSync(join(ROOT, 'data/deals.json'), JSON.stringify({ deals: dealList }, null, 2) + '\n');
console.log(`Wrote data/deals.json — ${dealList.length} unique deals.`);
