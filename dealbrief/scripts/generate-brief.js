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
import { getFiledMandates } from './edgar.js';

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

Your job: produce today's brief as a single JSON object. Use web search aggressively to find
REAL news published in the LAST 24 HOURS (today's date is ${TODAY}). Treat anything older than
48 hours as stale — only include older items if they are still the active story (e.g. a pending
deal moving to a new stage). Focus on the banks this desk covers:

${bankNames.join(', ')}

WHERE TO SEARCH (in priority order — run multiple searches, do not stop at one):
1. Wire services — Business Wire, PR Newswire, GlobeNewswire. Deal announcements appear here
   first and name the financial advisors in the release. Best fast confirmation.
2. Reuters and Bloomberg deal/M&A coverage — break most large-cap transactions.
3. M&A trade desks — ION Analytics / Mergermarket, The Deal, Axios Pro Rata — built for
   who-is-advising-whom.
4. The banks' own newsrooms / "recent transactions" pages (e.g. Goldman, Morgan Stanley,
   Evercore, Houlihan Lokey) — same-day, authoritative on their own mandates.
5. CNBC, WSJ, FT — for the macro and market-context layer (Fed, rates, market moves).

Run a search for the major active banks by name plus "advised" or "financial advisor", and a
separate macro search for today's market and Fed news. Aim for breadth across several banks.

For every item, the lens is always: "Does this create a reason for an Intralinks AE to reach
out to this bank's deal team today?" Tie everything back to data room / diligence / deal-process
needs. Be specific and factual. Do not invent deals — if you cannot verify a deal via search,
do not include it. Every story's source_url must be a real article you actually found in search.

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
      "confidence": "Filed|Reported"
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
- FRESHNESS: set "published" to each article's real publication date. Prioritize items
  published today or yesterday. Do not include anything older than 48 hours unless it is a
  still-active deal that advanced to a new stage. Lead with the freshest, highest-impact items.
- 5 to 8 stories. Tag each "scope": "market" (macro/regulatory, no bank) or "scope": "bank"
  (tied to one covered bank, set "bank" to its exact name).
- Aim for at least 5 bank-specific stories spread across different banks so coverage filtering
  has variety.
- 3 to 6 opportunities, each tied to a covered bank, each with a ready-to-send outreach_draft.
- CONFIDENCE TAGGING: every bank-scoped story must carry a "confidence" field.
  * Use "Filed" ONLY for mandates that appear in the VERIFIED FILED MANDATES block
    below (these come from SEC filings and are authoritative — a rep can quote them).
  * Use "Reported" for anything sourced from news/web search that is not in that block.
  * Prefer "Filed" mandates first when choosing bank stories. Market-scoped stories
    may omit confidence.
- Do NOT relabel a "Reported" item as "Filed". The distinction is the whole point:
  reps verify "Reported" items before quoting them on a call.
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

  // 1) Pull authoritative "Filed" mandates from SEC EDGAR first.
  //    This never blocks the run — if EDGAR is down, we proceed with
  //    web-search-only ("Reported") intelligence.
  let filedBlock = 'VERIFIED FILED MANDATES: (none found in the lookback window)';
  try {
    console.log('Querying SEC EDGAR for filed advisor mandates...');
    const mandates = await getFiledMandates(bankNames, { perBank: 3 });
    if (mandates.length) {
      const lines = mandates.map(m =>
        `- ${m.bank} | ${m.form} | ${m.date} | filer: ${m.title} | ${m.url}`
      );
      filedBlock =
        'VERIFIED FILED MANDATES (authoritative — from SEC EDGAR filings in the last ' +
        `${process.env.EDGAR_LOOKBACK_DAYS || 30} days). Build "Filed"-tagged bank ` +
        'stories from these, using the filing URL as the source_url:\n' +
        lines.join('\n');
      console.log(`  ✓ EDGAR returned ${mandates.length} filed mandates.`);
    } else {
      console.log('  EDGAR returned no mandates in the window.');
    }
  } catch (err) {
    console.warn('  EDGAR lookup failed, continuing with web search only:', err.message);
  }

  const userPrompt =
    `${USER_PROMPT}\n\n${filedBlock}`;

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
      messages: [{ role: 'user', content: userPrompt }],
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
