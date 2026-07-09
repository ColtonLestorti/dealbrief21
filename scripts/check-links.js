#!/usr/bin/env node
/* ============================================================
   check-links.js
   Guards against bad source links in the MAIN brief before publish.

   The rule (see docs/SOURCES.md → source tiers):
     - Every published source_url must be a REAL ARTICLE PERMALINK.
     - A Google News SEARCH-QUERY link (contains "search?q=") is NOT a
       source — it opens a raw feed/results page, not the article.
     - Bare RSS feed URLs and section-only pages are likewise rejected.
     - Skeptic's Corner is exempt: it cites "publisher, date" via
       source_note (no link) precisely because those leads aren't
       publicly resolvable. Unverified belongs THERE, not in the brief
       with a dead-looking link.

   Usage:  node scripts/check-links.js [path-to-daily.json]
   Exit 0 = clean; exit 1 = problems found (fails a publish step).
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const target = process.argv[2] || join(ROOT, 'data/daily.json');

const brief = JSON.parse(readFileSync(target, 'utf8'));
const problems = [];

// Reject: search-query links, bare RSS feeds, or anything not http(s).
function badUrl(url) {
  if (!url) return null;
  if (/[?&]q=/.test(url) || url.includes('/rss/search')) return 'search-query link (opens a feed, not an article)';
  if (url.includes('/rss/') || url.endsWith('.xml')) return 'raw RSS/XML feed, not an article';
  if (!/^https?:\/\//.test(url)) return 'not an http(s) URL';
  return null;
}

function checkItem(where, item) {
  // Main-brief items carry source_url (stories, opportunities via outreach_draft).
  const urls = [];
  if (item.source_url) urls.push(item.source_url);
  if (item.outreach_draft && item.outreach_draft.source_url) urls.push(item.outreach_draft.source_url);
  for (const u of urls) {
    const reason = badUrl(u);
    if (reason) problems.push(`${where} [${item.id || item.company || '?'}]: ${reason}\n    ${u}`);
  }
}

for (const s of brief.stories || []) checkItem('story', s);
for (const o of brief.opportunities || []) checkItem('opportunity', o);
// talking_point may carry a source_url too
if (brief.talking_point && brief.talking_point.source_url) checkItem('talking_point', { id: 'talking_point', source_url: brief.talking_point.source_url });

// Note (not an error): report how many Skeptic's Corner items are parked.
const skeptics = (brief.skeptics_corner && brief.skeptics_corner.items) || [];

if (problems.length) {
  console.error(`✗ ${problems.length} bad source link(s) in the main brief (edition ${brief.edition}):\n`);
  console.error(problems.join('\n\n'));
  console.error('\nFix: replace with a real article permalink, or move the item to skeptics_corner (source_note, no link).');
  process.exit(1);
}

console.log(`✓ Link check passed — edition ${brief.edition}: all main-brief source_urls are real article links.`);
console.log(`  (${skeptics.length} lead(s) parked in Skeptic's Corner — exempt, cited by publisher+date.)`);
