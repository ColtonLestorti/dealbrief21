#!/usr/bin/env node
/* ============================================================
   tally-mandates.js
   Counts distinct advisor mandates DealBrief has TRACKED per bank
   across the current edition (data/daily.json) plus every archived
   edition (data/archive/*.json).

   This is NOT an official league table — it only counts deals that
   appeared in DealBrief's own coverage. Bulge brackets are structurally
   undercounted (we catch a fraction of their real volume); pair this
   number with the advisory_signal league-table rank for honest context.

   Dedupe rule: a deal is counted once per bank, keyed by the bank name
   plus the item's source_url (the same deal often appears as both a
   story and an opportunity, and as both sides of a transaction — the
   shared source article collapses those into one tracked mandate).

   Usage:  node scripts/tally-mandates.js [--as-of YYYY-MM-DD] [--json]
   Default as-of date is today; --json prints machine-readable output.
   ============================================================ */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const asOfArg = args.includes('--as-of') ? args[args.indexOf('--as-of') + 1] : null;
const asJson = args.includes('--json');

const AS_OF = asOfArg ? new Date(asOfArg) : new Date();
const WINDOW_DAYS = 30;
const cutoff = new Date(AS_OF);
cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

function sourceUrlOf(item) {
  return item.source_url || (item.outreach_draft && item.outreach_draft.source_url) || '';
}
function publishedOf(item, editionDate) {
  return item.published || (item.outreach_draft && item.outreach_draft.published) || editionDate;
}

// Gather every edition file: archives + the live daily.json.
const editionFiles = [];
try {
  const archiveDir = join(ROOT, 'data/archive');
  for (const f of readdirSync(archiveDir).filter(f => f.endsWith('.json')).sort()) {
    editionFiles.push(join(archiveDir, f));
  }
} catch { /* no archive dir yet */ }
editionFiles.push(join(ROOT, 'data/daily.json'));

const allTime = {};   // bank -> Set(dedupe key)
const window30 = {};  // bank -> Set(dedupe key)
function record(map, bank, key) {
  if (!bank) return;
  (map[bank] = map[bank] || new Set()).add(key);
}

for (const file of editionFiles) {
  let edition;
  try {
    edition = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue; // skip unreadable/partial files rather than fail the whole tally
  }
  const items = [...(edition.stories || []), ...(edition.opportunities || [])];
  for (const item of items) {
    if (!item.bank) continue; // market-scoped items have no bank to credit
    const url = sourceUrlOf(item);
    const key = item.bank + '|' + (url || (item.headline || item.id || '').slice(0, 50).toLowerCase());
    record(allTime, item.bank, key);

    const pub = publishedOf(item, edition.date);
    const pubDate = pub ? new Date(pub) : null;
    if (pubDate && !isNaN(pubDate) && pubDate >= cutoff) {
      record(window30, item.bank, key);
    }
  }
}

const banks = [...new Set([...Object.keys(allTime), ...Object.keys(window30)])].sort();
const result = banks.map(bank => ({
  bank,
  mandates_30d: (window30[bank] && window30[bank].size) || 0,
  mandates_total: (allTime[bank] && allTime[bank].size) || 0
}));

if (asJson) {
  console.log(JSON.stringify({ as_of: AS_OF.toISOString().slice(0, 10), window_days: WINDOW_DAYS, banks: result }, null, 2));
} else {
  console.log(`Tracked mandates as of ${AS_OF.toISOString().slice(0, 10)} (30-day window + all-time):\n`);
  console.log('BANK'.padEnd(24) + '30d'.padStart(5) + '  all-time');
  for (const r of result) {
    console.log(r.bank.padEnd(24) + String(r.mandates_30d).padStart(5) + String(r.mandates_total).padStart(10));
  }
}
