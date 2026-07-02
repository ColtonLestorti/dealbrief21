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

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractJsonFromModelText } from './json-extract.js';
import { MODEL } from './model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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

  let market;
  try {
    market = extractJsonFromModelText(text);
  } catch (err) {
    console.error('Failed to parse JSON from model output. Raw text:\n', text.slice(0, 1000));
    throw err;
  }

  const validation = validateMarketData(market);
  if (!validation.ok) {
    throw new Error(`Generated market data failed validation: ${validation.reason}`);
  }

  market.generated_at = new Date().toISOString();

  mkdirSync(join(ROOT, 'data'), { recursive: true });
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
