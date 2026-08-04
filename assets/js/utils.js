/* ============================================================
   utils.js — Shared helpers used across all modules
   ============================================================ */

/**
 * Format a date string into a human-readable display.
 * @param {string} dateStr — ISO date string e.g. "2025-06-19"
 * @returns {string} e.g. "Thursday, June 19"
 */
export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Copy text to clipboard and show a toast notification.
 * @param {string} text — text to copy
 * @param {string} message — toast message (optional)
 */
export function copyToClipboard(text, message = 'Copied to clipboard') {
  navigator.clipboard.writeText(text).then(() => {
    showToast(message);
  }).catch(() => {
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(message);
  });
}

/**
 * Show a brief toast notification.
 * @param {string} message
 */
export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2200);
}

/**
 * Fetch a JSON file from the data directory.
 * @param {string} file — filename, e.g. "daily.json"
 * @returns {Promise<object>}
 */
export async function fetchData(file) {
  const res = await fetch(`data/${file}`);
  if (!res.ok) throw new Error(`Failed to load ${file}`);
  return res.json();
}

/**
 * Create a badge element.
 * @param {string} text
 * @param {string} type — 'category' | 'hot' | 'warm' | 'low' | 'your-bank'
 * @returns {HTMLElement}
 */
export function createBadge(text, type = 'category') {
  const el = document.createElement('span');
  el.className = `badge badge-${type}`;
  el.textContent = text;
  return el;
}

/**
 * Map urgency string to badge type.
 * @param {string} urgency — 'HIGH' | 'MEDIUM' | 'LOW' | 'HOT' | 'WARM'
 * @returns {string}
 */
export function urgencyToBadgeType(urgency) {
  const map = { HIGH: 'hot', HOT: 'hot', MEDIUM: 'warm', WARM: 'warm', LOW: 'low' };
  return map[urgency] || 'low';
}

/**
 * Get user preferences from localStorage.
 * @returns {{ banks: string[], industries: string[] } | null}
 */
export function getPrefs() {
  try {
    const raw = localStorage.getItem('dealbrief_prefs');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Save user preferences to localStorage.
 * @param {{ banks: string[], industries: string[] }} prefs
 */
export function savePrefs(prefs) {
  localStorage.setItem('dealbrief_prefs', JSON.stringify(prefs));
}

/**
 * Check if a bank is in the user's selected banks.
 * @param {string} bankName
 * @returns {boolean}
 */
export function isMyBank(bankName) {
  const prefs = getPrefs();
  if (!prefs || !prefs.banks) return false;
  if (typeof bankName !== 'string' || !bankName) return false;
  return prefs.banks.some(b => b.toLowerCase() === bankName.toLowerCase());
}

/**
 * Normalize a story/opportunity's advising bank(s) into a clean array.
 * Supports both the multi-bank `banks: [...]` field and the legacy single
 * `bank: "..."` string (older editions carry only `bank`), so the whole app
 * can iterate one shape. The first entry is treated as the primary/lead bank
 * for display and carry-forward identity.
 * @param {{banks?: string[]|string, bank?: string}} item
 * @returns {string[]}
 */
export function itemBanks(item) {
  if (!item) return [];
  const raw = Array.isArray(item.banks) ? item.banks
    : (item.banks ? [item.banks] : (item.bank ? [item.bank] : []));
  const seen = new Set();
  const out = [];
  for (const b of raw) {
    const name = String(b || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Does any of an item's advising banks belong to the user's coverage? This is
 * the multi-bank coverage test — a co-advised deal surfaces for a rep who
 * covers ANY bank on it, not just the lead.
 * @param {string[]} banks — from itemBanks(item)
 * @returns {boolean}
 */
export function isMyBankAny(banks) {
  return Array.isArray(banks) && banks.some(b => isMyBank(b));
}

/**
 * Given the user's selected bank names and today's stories + opportunities,
 * return the selected banks that have NO coverage today (no bank-scope story
 * and no opportunity). This powers an honest "no deals today for X" note so a
 * rep who picked a quiet bank sees a clear status instead of an empty feed.
 * Case-insensitive match; preserves the caller's bank-name spelling/order.
 * @param {string[]} selectedBanks
 * @param {Array<{scope?: string, bank?: string}>} stories
 * @param {Array<{bank?: string}>} opps
 * @returns {string[]}
 */
export function banksMissingCoverage(selectedBanks, stories = [], opps = []) {
  if (!Array.isArray(selectedBanks) || selectedBanks.length === 0) return [];
  const covered = new Set();
  for (const s of stories) {
    if (s && s.scope === 'bank') {
      for (const b of itemBanks(s)) covered.add(b.toLowerCase());
    }
  }
  for (const o of opps) {
    if (o) {
      for (const b of itemBanks(o)) covered.add(b.toLowerCase());
    }
  }
  return selectedBanks.filter(b => b && !covered.has(b.toLowerCase()));
}

/**
 * Escape HTML to prevent XSS when inserting user/data content.
 * @param {string} str
 * @returns {string}
 */
export function esc(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Toggle card expand/collapse.
 * @param {HTMLElement} card
 */
export function toggleCard(card) {
  card.classList.toggle('expanded');
}

/**
 * Expand a card.
 * @param {HTMLElement} card
 */
export function expandCard(card) {
  card.classList.add('expanded');
}

/**
 * Fetch a JSON file from the data directory, bypassing HTTP/CDN caches.
 * Use for data that refreshes intraday (e.g. market.json polling).
 * @param {string} file — filename, e.g. "market.json"
 * @returns {Promise<object>}
 */
export async function fetchDataFresh(file) {
  const res = await fetch(`data/${file}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${file}`);
  return res.json();
}

/**
 * Decide whether intraday market.json data is fresher than daily.json's
 * embedded ticker/market_snapshot. market.json only wins if it was
 * actually regenerated today — otherwise it may hold yesterday's
 * afternoon data, which is staler than a same-morning daily.json.
 * @param {string} dailyDate — daily.json's "date" field, e.g. "2026-07-01"
 * @param {string} marketGeneratedAt — market.json's "generated_at" ISO timestamp
 * @returns {boolean}
 */
export function isMarketDataFresh(dailyDate, marketGeneratedAt) {
  if (!dailyDate || !marketGeneratedAt) return false;
  return marketGeneratedAt.slice(0, 10) === dailyDate;
}

/**
 * Map a story/opportunity confidence tag to its tooltip explanation.
 * @param {string} confidence — 'Filed' | 'Reported' | 'Speculative'
 * @returns {string}
 */
export function confidenceTooltip(confidence) {
  const map = {
    Filed: 'From an SEC filing — authoritative',
    Reported: 'From news — verify before quoting',
    Speculative: 'Rumored/unconfirmed — verify before quoting on a call'
  };
  return map[confidence] || 'From news — verify before quoting';
}

/**
 * Plain-language, action-oriented label for a confidence tag — what the badge
 * shows a rep. The precise tag (Filed/Reported/Speculative) stays in the
 * tooltip; the badge itself reads as an instruction they can act on at a glance.
 * @param {string} confidence — 'Filed' | 'Reported' | 'Speculative'
 * @returns {string}
 */
export function confidenceLabel(confidence) {
  const map = {
    Filed: 'Confirmed',
    Reported: 'Verify first',
    Speculative: 'Rumor'
  };
  return map[confidence] || 'Verify first';
}

/* ============================================================
   Coverage-team inference
   A rep works a bank's *coverage group* (TMT, Healthcare, FIG…),
   not the whole bank — so each deal card shows which team most
   likely owns the mandate. We infer it from the deal's sector,
   tags, and headline so it works on every past edition too, with
   no data re-tagging. An explicit `coverage_team` (string or
   array) on the item always wins over inference.
   ============================================================ */

// Each team owns a set of keyword signals. Order matters only for the
// display order of multiple matches; a deal can surface more than one team.
const COVERAGE_TEAMS = [
  // NOTE: "platform" is deliberately excluded — PE releases call almost any
  // deal a "platform investment", which over-matches to TMT.
  { team: 'TMT', keywords: ['tech', 'software', 'saas', 'ai', 'artificial intelligence', 'cloud', 'data center', 'data-center', 'semiconductor', 'chip', 'media', 'telecom', 'telecommunication', 'internet', 'digital', 'fintech', 'payments', 'compute'] },
  { team: 'Healthcare', keywords: ['health', 'healthcare', 'biotech', 'biopharma', 'pharma', 'medtech', 'medical', 'device', 'life science', 'therapeutic', 'drug', 'clinical', 'regenerative', 'diagnostic'] },
  { team: 'FIG', keywords: ['bank', 'banking', 'financial services', 'financial institution', 'insurance', 'insurer', 'asset manager', 'wealth', 'exchange', 'market structure', 'brokerage', 'specialty finance', 'lending'] },
  { team: 'Energy & Power', keywords: ['energy', 'oil', 'gas', 'midstream', 'utility', 'utilities', 'power', 'renewable', 'renewables', 'clean power', 'royalty', 'pipeline', 'lng', 'solar', 'wind'] },
  { team: 'Consumer & Retail', keywords: ['consumer', 'retail', 'convenience', 'restaurant', 'food', 'beverage', 'apparel', 'grocery', 'e-commerce', 'ecommerce', 'marine', 'boat', 'auto retail', 'dealership'] },
  // NOTE: "infrastructure" is deliberately NOT a keyword here — "AI/digital
  // infrastructure" is TMT, and generic "infrastructure" over-matches. Physical
  // industrial deals surface via the specific terms below.
  { team: 'Industrials', keywords: ['industrial', 'industrials', 'manufactur', 'materials', 'chemical', 'aerospace', 'defense', 'defence', 'machinery', 'engineering', 'inspection', 'thermal', 'building', 'transportation', 'shipping', 'logistics', 'automotive'] },
  { team: 'Real Estate', keywords: ['real estate', 'reit', 'property', 'realty', 'hospitality', 'lodging'] }
];

const COVERAGE_TEAM_ORDER = COVERAGE_TEAMS.map(t => t.team);

/**
 * Does a keyword match the deal text? Token-aware to avoid false hits from
 * naive substring matching (e.g. "ai" living inside "retail"/"AtaiBeckley"):
 *  - multi-word / hyphenated phrases ("data center", "e-commerce") match as
 *    substrings of the full text;
 *  - keywords of 4+ chars match a token *prefix*, so "tech" catches
 *    "technology" and "manufactur" catches "manufacturing";
 *  - short, ambiguous keywords (≤3 chars: "ai", "gas", "oil") require a whole
 *    token, allowing a trailing "s" for a simple plural.
 * @param {string} keyword — already lowercase
 * @param {string} haystack — full lowercase text
 * @param {string[]} tokens — haystack split into alphanumeric tokens
 * @returns {boolean}
 */
function keywordMatches(keyword, haystack, tokens) {
  if (/[ -]/.test(keyword)) return haystack.includes(keyword);
  if (keyword.length >= 4) return tokens.some(t => t.startsWith(keyword));
  return tokens.some(t => t === keyword || t === `${keyword}s`);
}

/**
 * Infer the likely covering team(s) for a deal from its sector, tags, and
 * headline. Returns an ordered, de-duplicated list; falls back to a generic
 * ['M&A'] when nothing matches. An explicit `coverage_team` on the item
 * (string or array) short-circuits inference.
 * @param {{sector?: string, tags?: string[], headline?: string, category?: string, coverage_team?: string|string[]}} item
 * @returns {string[]}
 */
export function coverageTeams(item) {
  if (!item) return ['M&A'];

  // Explicit override always wins.
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
  // Preserve the canonical team order for a stable, readable display.
  return COVERAGE_TEAM_ORDER.filter(t => matched.has(t));
}
