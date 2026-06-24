/* ============================================================
   today.js — Today page renderer
   Loads daily.json and renders all sections.
   ============================================================ */

import { fetchData, esc, urgencyToBadgeType, isMyBank, copyToClipboard, formatDate, getPrefs } from './utils.js';

let dailyData = null;   // today's brief (the live edition)
let activeData = null;  // currently displayed brief (today or an archived edition)

/**
 * Initialize and render the Today page (live edition).
 */
export async function initToday() {
  try {
    dailyData = await fetchData('daily.json');
    renderBrief(dailyData, { archived: false });
  } catch (err) {
    console.error('Failed to load daily data:', err);
  }
}

/**
 * Render a brief object (today's or an archived edition).
 * @param {object} data
 * @param {{archived:boolean}} opts
 */
function renderBrief(data, { archived }) {
  activeData = data;
  renderArchiveBanner(archived ? data : null);
  renderTicker(data.ticker);
  renderTodayHeader(data);
  renderStories(data.stories);
  renderOpportunities(data.opportunities);
  renderMarketSnapshot(data.market_snapshot);
  renderTalkingPoint(data.talking_point);
  // Archive list always reflects today's archive (the live edition).
  renderArchive(dailyData ? dailyData.archive : data.archive);
}

/**
 * Load and display an archived edition by file name.
 * @param {string} file e.g. "2026-06-18.json"
 */
async function loadArchivedEdition(file) {
  try {
    const res = await fetch(`data/archive/${file}`);
    if (!res.ok) throw new Error(`Could not load ${file}`);
    const data = await res.json();
    renderBrief(data, { archived: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
  }
}

/** Return to today's live edition. */
function backToToday() {
  if (dailyData) {
    renderBrief(dailyData, { archived: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/** Show or clear the "viewing archived edition" banner. */
function renderArchiveBanner(archivedData) {
  const el = document.getElementById('archive-banner');
  if (!el) return;
  if (!archivedData) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'flex';
  el.innerHTML = `
    <span>Viewing archived edition <strong>#${archivedData.edition}</strong> — ${formatDate(archivedData.date)}</span>
    <button class="btn btn-primary" id="back-to-today-btn">← Back to today</button>
  `;
  document.getElementById('back-to-today-btn').addEventListener('click', backToToday);
}

// Expose archive loader for click handlers.
window._loadArchivedEdition = loadArchivedEdition;

/* ── Ticker ─────────────────────────────────────────────── */
function renderTicker(items) {
  if (!items || !items.length) return;
  const track = document.getElementById('ticker-track');
  if (!track) return;

  // Duplicate items to create seamless loop
  const html = [...items, ...items].map(item => `
    <div class="ticker-item">
      <span class="ticker-label">${esc(item.label)}</span>
      <span class="ticker-value">${esc(item.value)}</span>
      <span class="ticker-change ${item.positive ? 'positive' : 'negative'}">${esc(item.change)}</span>
    </div>
  `).join('');

  track.innerHTML = html;
}

/* ── Today Header ────────────────────────────────────────── */
function renderTodayHeader(data) {
  const el = document.getElementById('today-header');
  if (!el) return;

  el.innerHTML = `
    <div class="today-meta">
      <span class="today-date">${formatDate(data.date)}</span>
      <span class="today-edition font-mono">Edition #${data.edition}</span>
    </div>
    <p class="today-lens">${esc(data.lens)}</p>
  `;
}

/* ── Stories ─────────────────────────────────────────────── */
/**
 * Strict filtering:
 *  - Always keep up to 2 market-wide stories (scope: 'market'),
 *    highest urgency first.
 *  - Keep every story tied to one of the user's selected banks.
 *  - Drop bank-specific stories for banks the user doesn't cover.
 *  - If the user selected no banks, show everything (graceful default).
 */
function filterStories(stories) {
  const prefs = getPrefs();
  const hasSelections = prefs?.banks?.length > 0;

  if (!hasSelections) return { stories, filtered: false, marketCount: 0 };

  const urgencyRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const byUrgency = (a, b) =>
    (urgencyRank[a.urgency] ?? 3) - (urgencyRank[b.urgency] ?? 3);

  // Market-wide headlines (Fed, macro, megadeals): keep up to 5 by urgency.
  // These are the universal "what happened this week" digest.
  const market = stories
    .filter(s => s.scope === 'market')
    .sort(byUrgency)
    .slice(0, 5);

  // Bank-specific: keep only the user's banks.
  const myBankStories = stories
    .filter(s => s.scope === 'bank' && s.bank && isMyBank(s.bank))
    .sort(byUrgency);

  // My banks lead, then the market headlines.
  const result = [...myBankStories, ...market];

  return { stories: result, filtered: true, marketCount: market.length, bankCount: myBankStories.length };
}

function renderStories(allStories) {
  const container = document.getElementById('stories-list');
  if (!container || !allStories) return;

  const { stories, filtered, marketCount, bankCount } = filterStories(allStories);

  // Context line explaining the filter
  const contextEl = document.getElementById('stories-context');
  if (contextEl) {
    if (filtered) {
      contextEl.innerHTML = bankCount > 0
        ? `Showing <strong>${bankCount}</strong> ${bankCount === 1 ? 'story' : 'stories'} for your banks plus ${marketCount} market-wide ${marketCount === 1 ? 'headline' : 'headlines'}.`
        : `No bank-specific stories today for your coverage. Showing ${marketCount} market-wide ${marketCount === 1 ? 'headline' : 'headlines'} — Fed, macro, and the biggest deals.`;
      contextEl.style.display = 'block';
    } else {
      contextEl.style.display = 'none';
    }
  }

  if (stories.length === 0) {
    container.innerHTML = `<div class="no-results">No stories match your coverage today. Check back tomorrow, or adjust your banks in Settings.</div>`;
    return;
  }

  container.innerHTML = stories.map((story, index) => {
    const isExpanded = index < 3; // First 3 expanded by default
    const urgencyType = urgencyToBadgeType(story.urgency);
    const myBank = story.bank && isMyBank(story.bank);
    const isMarket = story.scope === 'market';

    const dealClockHtml = story.deal_clock && story.deal_clock.length ? `
      <div class="deal-clock">
        <div class="deal-clock-title">Deal Clock</div>
        <div class="deal-clock-items">
          ${story.deal_clock.map(item => `
            <div class="deal-clock-item">
              <span class="deal-clock-date">${esc(item.date)}</span>
              <span class="deal-clock-event">${esc(item.event)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    return `
      <div class="card ${isExpanded ? 'expanded' : ''}" data-card-id="${story.id}">
        <div class="card-header" onclick="this.closest('.card').classList.toggle('expanded')">
          <div class="card-headline-wrap">
            <div class="card-badges">
              <span class="badge badge-category">${esc(story.category)}</span>
              <span class="badge badge-${urgencyType}">${esc(story.urgency)}</span>
              ${myBank ? '<span class="badge badge-your-bank">YOUR BANK</span>' : ''}
              ${isMarket ? '<span class="badge badge-market">MARKET-WIDE</span>' : ''}
            </div>
            <h3 class="card-headline mt-2">${esc(story.headline)}</h3>
          </div>
          <span class="card-toggle">›</span>
        </div>
        <div class="card-body">
          <div class="card-section">
            <div class="card-section-label">Why it Matters</div>
            <div class="card-section-text">${esc(story.why_it_matters)}</div>
          </div>
          <div class="card-section">
            <div class="card-section-label">Suggested Action</div>
            <div class="card-section-text">${esc(story.suggested_action)}</div>
          </div>
          ${dealClockHtml}
          <div class="card-footer">
            <div class="card-footer-left">
              ${story.source_url ? `<a href="${esc(story.source_url)}" target="_blank" rel="noopener" class="source-link">${esc(story.source)} ↗</a>` : ''}
            </div>
            <div class="card-footer-right">
              <button class="btn btn-ghost" onclick="event.stopPropagation(); window._copyTalkingPoint('${esc(story.suggested_action)}')">
                Copy Talking Point
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Expose copy helper globally
  window._copyTalkingPoint = (text) => copyToClipboard(text, 'Talking point copied');
}

/* ── Opportunities ───────────────────────────────────────── */
/**
 * Strict: show only opportunities tied to the user's banks.
 * If no banks selected, show all (graceful default).
 */
function renderOpportunities(opps) {
  const container = document.getElementById('opportunities-list');
  if (!container || !opps) return;

  const prefs = getPrefs();
  const hasSelections = prefs?.banks?.length > 0;

  let visible = opps;
  if (hasSelections) {
    visible = opps.filter(o => isMyBank(o.bank));
  }

  // Context line
  const contextEl = document.getElementById('opportunities-context');
  if (contextEl) {
    if (hasSelections) {
      contextEl.innerHTML = visible.length > 0
        ? `Opportunities for your banks only.`
        : `No opportunities for your banks today. Adjust coverage in Settings to see more.`;
      contextEl.style.display = 'block';
    } else {
      contextEl.style.display = 'none';
    }
  }

  if (visible.length === 0) {
    container.innerHTML = `<div class="no-results">No opportunities match your coverage today.</div>`;
    window._opportunitiesData = opps;
    return;
  }

  container.innerHTML = visible.map((opp, index) => {
    const isExpanded = index === 0;
    const urgencyType = urgencyToBadgeType(opp.urgency);
    const myBank = isMyBank(opp.bank);

    const dealClockHtml = opp.deal_clock && opp.deal_clock.length ? `
      <div class="deal-clock">
        <div class="deal-clock-title">Deal Clock</div>
        <div class="deal-clock-items">
          ${opp.deal_clock.map(item => `
            <div class="deal-clock-item">
              <span class="deal-clock-date">${esc(item.date)}</span>
              <span class="deal-clock-event">${esc(item.event)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    return `
      <div class="card ${isExpanded ? 'expanded' : ''}" data-opp-id="${opp.id}">
        <div class="card-header" onclick="this.closest('.card').classList.toggle('expanded')">
          <div class="card-headline-wrap">
            <div class="card-badges">
              <span class="badge badge-${urgencyType}">${esc(opp.urgency)}</span>
              ${myBank ? '<span class="badge badge-your-bank">YOUR BANK</span>' : ''}
            </div>
            <div class="mt-2 flex items-center gap-2" style="flex-wrap:wrap;gap:6px;">
              <span class="opp-card-bank">${esc(opp.bank)}</span>
              <span class="opp-card-divider">·</span>
              <span class="opp-card-sector" style="color:var(--text-muted);font-size:var(--text-sm)">${esc(opp.sector)}</span>
            </div>
            <h3 class="card-headline mt-2" style="font-size:var(--text-base)">${esc(opp.headline)}</h3>
          </div>
          <span class="card-toggle">›</span>
        </div>
        <div class="card-body">
          <div class="card-section">
            <div class="card-section-label">Why it Matters</div>
            <div class="card-section-text">${esc(opp.why_it_matters)}</div>
          </div>
          ${dealClockHtml}
          <div class="card-section">
            <div class="card-section-label">Outreach Idea</div>
            <div class="card-section-text">${esc(opp.outreach_idea)}</div>
          </div>
          <div class="card-footer">
            <div class="card-footer-left"></div>
            <div class="card-footer-right">
              <button class="btn btn-primary" onclick="event.stopPropagation(); window._openOutreachModal('${esc(opp.id)}')">
                ✉ View Outreach Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Store opportunities data for modal access
  window._opportunitiesData = opps;
}

/* ── Market Snapshot ─────────────────────────────────────── */
function renderMarketSnapshot(snapshot) {
  const container = document.getElementById('market-snapshot');
  if (!container || !snapshot) return;

  const indicesHtml = snapshot.indices.map(idx => `
    <div class="market-stat">
      <div class="market-stat-label">${esc(idx.label)}</div>
      <div class="market-stat-value">${esc(idx.value)}</div>
      <div class="market-stat-change ${idx.positive ? 'positive' : 'negative'}">${esc(idx.change)}</div>
    </div>
  `).join('');

  const stocksHtml = (snapshot.bank_stocks && snapshot.bank_stocks.length)
    ? `<div class="bank-stocks-row">${snapshot.bank_stocks.map(s => `
        <div class="bank-stock">
          <span class="bank-stock-ticker">${esc(s.ticker)}</span>
          <span class="bank-stock-price">${esc(s.price)}</span>
          <span class="bank-stock-change ${s.positive ? 'positive' : 'negative'}">${esc(s.change)}</span>
        </div>`).join('')}</div>`
    : '';

  container.innerHTML = `
    <div class="market-grid">${indicesHtml}</div>
    ${stocksHtml}
    <div class="macro-note">${esc(snapshot.macro_note)}</div>
  `;
}

/* ── Talking Point ───────────────────────────────────────── */
function renderTalkingPoint(tp) {
  const container = document.getElementById('talking-point');
  if (!container || !tp) return;

  container.innerHTML = `
    <div class="talking-point-card">
      <div class="talking-point-quote">"${esc(tp.quote)}"</div>
      <div class="talking-point-context">${esc(tp.context)}</div>
      <div class="talking-point-footer">
        <div>
          <div class="talking-point-use font-mono" style="font-size:var(--text-xs);color:var(--text-muted);letter-spacing:0.06em;text-transform:uppercase;">
            Use with: ${esc(tp.use_with)}
          </div>
        </div>
        <button class="btn btn-ghost" onclick="window._copyTalkingPoint('${esc(tp.quote)}')">
          Copy
        </button>
      </div>
    </div>
  `;
}

/* ── Archive ─────────────────────────────────────────────── */
function renderArchive(archive) {
  const container = document.getElementById('archive-list');
  if (!container) return;

  if (!archive || archive.length === 0) {
    container.innerHTML = `<div class="text-muted" style="font-size:var(--text-sm)">No past editions yet. Each day's brief is saved here automatically.</div>`;
    return;
  }

  container.innerHTML = archive.map(item => `
    <div class="archive-item" onclick="window._loadArchivedEdition('${esc(item.file)}')" role="button" tabindex="0">
      <div class="archive-date">${esc(formatDate(item.date))}</div>
      <div class="archive-edition">Edition #${item.edition} ↗</div>
    </div>
  `).join('');
}
