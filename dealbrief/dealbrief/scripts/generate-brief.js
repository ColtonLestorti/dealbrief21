#!/usr/bin/env node
/* ============================================================
   generate-brief.js
   Generates data/daily.json using the Claude API with web search.

   Run locally:   ANTHROPIC_API_KEY=sk-... node scripts/generate-brief.js
   Run in CI:     handled by .github/workflows/daily-brief.yml

   It does three things:
     1. Reads the current banks.json to know the coverage universe.
     2. Asks Claude (with web search) for today's M&A / banking
        intelligence, formatted to match the daily.json schema.
     3. Validates and writes data/daily.json.

   No external npm packages — uses Node 20's built-in fetch.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

const MODEL = 'claude-sonnet-4-6';
const TODAY = new Date().toISOString().slice(0, 10);

// ── Load the coverage universe so the brief targets real banks ──
const banks = JSON.parse(readFileSync(join(ROOT, 'data/banks.json'), 'utf8')).banks;
const bankNames = banks.map(b => b.name);

// ── The Daily Intelligence Prompt ──────────────────────────────
// This is the editorial brief Claude follows. Tune the wording here
// to change tone, focus, or selection logic — it's the one place
// that controls what the AE sees each morning.
const SYSTEM_PROMPT = `You are the lead intelligence analyst for DealBrief, a daily sales-intelligence
brief for SS&C Intralinks Account Executives who sell virtual data rooms to investment banks
running M&A, capital markets, and restructuring processes.

Your job: produce today's brief as a single JSON object. Use web search to find REAL, RECENT
(last 48 hours) news about investment banking M&A advisory activity. Focus on the banks this
desk covers:

${bankNames.join(', ')}

For every item, the lens is always: "Does this create a reason for an Intralinks AE to reach
out to this bank's deal team today?" Tie everything back to data room / diligence / deal-process
needs. Be specific and factual. Do not invent deals — if you cannot verify a deal via search,
do not include it.

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
      "source_url": "https://..."
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
      "outreach_draft": { "subject": "...", "body": "..." }
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
- 5 to 8 stories. Tag each "scope": "market" (macro/regulatory, no bank) or "scope": "bank"
  (tied to one covered bank, set "bank" to its exact name).
- Aim for at least 5 bank-specific stories spread across different banks so coverage filtering
  has variety.
- 3 to 6 opportunities, each tied to a covered bank, each with a ready-to-send outreach_draft.
- Use real market data from search for ticker and market_snapshot. Pull the most recent close
  for major indices (S&P 500, Nasdaq, Dow, Russell 2000), the 10Y and 2Y Treasury yields, VIX,
  and WTI crude, plus current prices for the major bank stocks (GS, MS, JPM, EVR, LAZ, JEF).
  ACCURACY IS CRITICAL: if you cannot verify a number from search, omit that item entirely
  rather than estimate — an empty/short ticker is better than a wrong one.
- Keep "archive" as an empty array; the site manages history separately.
- Output must be valid JSON and nothing else.`;

const USER_PROMPT = `Generate the DealBrief intelligence brief for ${TODAY}. Search the web for
today's investment banking and M&A news, current market levels, and bank stock prices. Then
return the JSON object exactly as specified.`;

// ── Call the Claude API ────────────────────────────────────────
async function generate() {
  console.log(`Generating brief for ${TODAY} using ${MODEL}...`);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
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

  // Concatenate all text blocks (web search interleaves tool blocks).
  const text = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  // Strip any stray code fences just in case.
  const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  let brief;
  try {
    brief = JSON.parse(clean);
  } catch (err) {
    console.error('Failed to parse JSON from model output. Raw text:\n', clean.slice(0, 1000));
    throw err;
  }

  // ── Validate the essentials before writing ──
  const required = ['date', 'lens', 'stories', 'opportunities', 'market_snapshot', 'talking_point'];
  const missing = required.filter(k => !(k in brief));
  if (missing.length) {
    throw new Error(`Generated brief is missing fields: ${missing.join(', ')}`);
  }
  if (!Array.isArray(brief.stories) || brief.stories.length === 0) {
    throw new Error('Generated brief has no stories.');
  }

  // Preserve/auto-increment the edition number, and archive the prior edition.
  try {
    const prev = JSON.parse(readFileSync(join(ROOT, 'data/daily.json'), 'utf8'));
    if (typeof prev.edition === 'number') {
      brief.edition = prev.edition + 1;

      // Save the prior edition as a standalone, viewable archive file.
      try {
        mkdirSync(join(ROOT, 'data/archive'), { recursive: true });
        const archiveCopy = { ...prev };
        delete archiveCopy.archive; // archived editions don't nest their own archive
        writeFileSync(join(ROOT, `data/archive/${prev.date}.json`), JSON.stringify(archiveCopy, null, 2) + '\n');
      } catch (e) {
        console.warn('Could not write archive copy:', e.message);
      }

      // Prepend the prior edition to the archive index (keep last 12).
      brief.archive = [
        { date: prev.date, edition: prev.edition, file: `${prev.date}.json` },
        ...(prev.archive || [])
      ].slice(0, 12);
    }
  } catch {
    // No prior file — keep model's edition and empty archive.
  }

  writeFileSync(join(ROOT, 'data/daily.json'), JSON.stringify(brief, null, 2) + '\n');
  console.log(`✓ Wrote data/daily.json — edition #${brief.edition}, ${brief.stories.length} stories, ${brief.opportunities.length} opportunities.`);
}

generate().catch(err => {
  console.error('Generation failed:', err.message);
  process.exit(1);
});
