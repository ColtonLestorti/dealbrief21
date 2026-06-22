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
  return prefs.banks.some(b => b.toLowerCase() === bankName.toLowerCase());
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
