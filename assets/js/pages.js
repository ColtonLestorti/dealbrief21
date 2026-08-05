/* ============================================================
   pages.js — Banks, Deals, and Resources page renderers
   ============================================================ */

import { fetchData, esc, urgencyToBadgeType, getPrefs, copyToClipboard, confidenceTooltip, confidenceLabel, isMyBankAny, itemBanks } from './utils.js?v=20260805-1';

/* ══════════════════════════════════════════════════════════
   BANKS PAGE
   ══════════════════════════════════════════════════════════ */

let banksData = null;
let activeBankId = null;

export async function initBanks() {
  try {
    const data = await fetchData('banks.json');
    banksData = data.banks;
    const prefs = getPrefs();
    const myBankIds = prefs?.banks?.map(b => b.toLowerCase().replace(/\s+/g, '-')) || [];

    // Filter to user's selected banks, or show all if none selected
    const selectedBanks = myBankIds.length > 0
      ? banksData.filter(b => prefs.banks.some(pb => pb.toLowerCase() === b.name.toLowerCase()))
      : banksData;

    if (selectedBanks.length === 0) {
      renderBanksEmpty();
      return;
    }

    renderBankTabs(selectedBanks);
    activeBankId = selectedBanks[0].id;
    renderBankDetail(selectedBanks[0]);
  } catch (err) {
    console.error('Failed to load banks:', err);
  }
}

function renderBanksEmpty() {
  const container = document.getElementById('banks-content');
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🏦</div>
      <div class="empty-state-title">No banks selected</div>
      <div class="empty-state-text">Go to Settings to select the banks you cover, and they'll appear here with their latest news, deals, and talking points.</div>
      <button class="btn btn-primary" onclick="document.getElementById('settings-btn').click()">Open Settings</button>
    </div>
  `;
}

function renderBankTabs(banks) {
  const tabsEl = document.getElementById('bank-tabs');
  if (!tabsEl) return;

  tabsEl.innerHTML = banks.map((bank, i) => `
    <button class="bank-tab ${i === 0 ? 'active' : ''}" data-bank-id="${bank.id}" onclick="window._switchBank('${bank.id}')">
      ${esc(bank.name)}
    </button>
  `).join('');

  window._switchBank = (bankId) => {
    const bank = banksData.find(b => b.id === bankId);
    if (!bank) return;

    // Update tab active state
    document.querySelectorAll('.bank-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.bankId === bankId);
    });

    activeBankId = bankId;
    renderBankDetail(bank);
  };
}

function renderBankDetail(bank) {
  const container = document.getElementById('bank-detail');
  if (!container) return;

  const hasNews = bank.news && bank.news.length > 0;
  const hasDeals = bank.deals && bank.deals.length > 0;
  const hasTalkingPoints = bank.talking_points && bank.talking_points.length > 0;

  container.innerHTML = `
    <div class="bank-header-row">
      <div>
        <h2 class="bank-name">${esc(bank.name)}</h2>
      </div>
      <div class="bank-meta">
        <span class="bank-type">${esc(bank.type)}</span>
        ${bank.ticker !== 'N/A' ? `<span class="badge badge-category font-mono">${esc(bank.ticker)}</span>` : ''}
      </div>
    </div>

    ${renderBankTracker(bank.dealbrief_tracker)}

    <!-- Recent News -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">Recent News</span>
      </div>
      ${hasNews
        ? bank.news.map(item => renderBankNewsCard(item)).join('')
        : `<div class="empty-state" style="padding: var(--space-8);">
             <div class="empty-state-text">No recent news for ${esc(bank.name)}.</div>
           </div>`
      }
    </div>

    <!-- Recent Deals -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">Recent Deals</span>
      </div>
      ${hasDeals
        ? bank.deals.map(deal => renderBankDealCard(deal)).join('')
        : `<div class="empty-state" style="padding: var(--space-8);">
             <div class="empty-state-text">No recent deals for ${esc(bank.name)}.</div>
           </div>`
      }
    </div>

    <!-- Talking Points -->
    ${hasTalkingPoints ? `
    <div class="section">
      <div class="section-header">
        <span class="section-title">Talking Points</span>
      </div>
      ${bank.talking_points.map(tp => `
        <div class="talking-point-card" style="margin-bottom:var(--space-3);">
          <div class="talking-point-quote" style="font-size:var(--text-base);">"${esc(tp.text)}"</div>
          <div class="talking-point-footer">
            <div class="talking-point-use">Use with: ${esc(tp.use_with)}</div>
            <button class="btn btn-ghost" onclick="window._copyTalkingPoint('${esc(tp.text)}')">Copy</button>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}
  `;

  window._copyTalkingPoint = (text) => copyToClipboard(text, 'Talking point copied');
}

function renderBankTracker(tracker) {
  if (!tracker) return '';

  const signalHtml = tracker.advisory_signal ? `
    <div class="tracker-signal">
      <div class="tracker-label">Advisory Signal</div>
      <div class="tracker-signal-text">${esc(tracker.advisory_signal.rank)}</div>
      <a href="${esc(tracker.advisory_signal.source_url)}" target="_blank" rel="noopener" class="source-link">
        ${esc(tracker.advisory_signal.source)} · ${esc(tracker.advisory_signal.period)} ↗
      </a>
    </div>
  ` : '';

  const pipelineHtml = (tracker.pipeline_watch && tracker.pipeline_watch.length) ? `
    <div class="tracker-pipeline">
      <div class="tracker-label">Pipeline Watch <span class="badge badge-conf-speculative">SPECULATIVE</span></div>
      ${tracker.pipeline_watch.map(p => `
        <div class="pipeline-item">
          <div class="pipeline-company">${esc(p.company)}</div>
          <div class="pipeline-situation">${esc(p.situation)}</div>
          <div class="pipeline-meta">
            <span class="pipeline-sector">${esc(p.sector)}</span>
            <span class="deal-meta-dot">·</span>
            <span class="pipeline-source">${esc(p.source_note)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const asOf = tracker.as_of ? ` as of ${esc(tracker.as_of)}` : '';

  return `
    <div class="bank-tracker">
      <div class="tracker-row">
        <div class="tracker-stat">
          <div class="tracker-stat-num">${tracker.mandates_30d}</div>
          <div class="tracker-stat-label" title="Mandates DealBrief caught in its own coverage over the last 30 days — not the bank's full book">Mandates we caught (30d)</div>
        </div>
        <div class="tracker-stat">
          <div class="tracker-stat-num">${tracker.mandates_total}</div>
          <div class="tracker-stat-label" title="All mandates DealBrief has caught in its coverage to date${asOf}">Caught to date</div>
        </div>
      </div>
      ${signalHtml}
      ${renderCaughtMandates(tracker.caught_mandates)}
      ${pipelineHtml}
      <div class="tracker-note">${esc(tracker.note)}</div>
    </div>
  `;
}

/**
 * "Mandates we caught (full list)" — a collapsible drawer of the actual deals
 * behind the tracker counts, newest-first, each with its date, confidence, and
 * source link. Shows the 15 newest by default with a "show all" toggle so a
 * high-volume bank (Goldman, Jefferies) doesn't become a scroll wall.
 * @param {Array<{headline:string, published:string, confidence:string, source:string, source_url:string}>} mandates
 * @returns {string}
 */
const CAUGHT_PREVIEW = 15;
function renderCaughtMandates(mandates) {
  if (!Array.isArray(mandates) || mandates.length === 0) return '';

  const teamBadges = m => {
    const teams = Array.isArray(m.coverage_team) ? m.coverage_team : (m.coverage_team ? [m.coverage_team] : []);
    return teams.map(t => `<span class="badge badge-team" title="Covering group at the advising bank">${esc(t)}</span>`).join('');
  };

  const row = m => `
    <div class="caught-item">
      <span class="caught-date font-mono">${esc(m.published || '')}</span>
      <div class="caught-body">
        <div class="caught-headline">${esc(m.headline || '')}</div>
        <div class="caught-meta">
          ${m.confidence ? `<span class="badge badge-conf-${esc(m.confidence.toLowerCase())}" title="${esc(m.confidence)} — ${esc(confidenceTooltip(m.confidence))}">${esc(confidenceLabel(m.confidence))}</span>` : ''}
          ${teamBadges(m)}
          ${m.source_url ? `<a href="${esc(m.source_url)}" target="_blank" rel="noopener" class="source-link">${esc(m.source || 'Source')} ↗</a>` : (m.source ? `<span class="pipeline-source">${esc(m.source)}</span>` : '')}
        </div>
      </div>
    </div>
  `;

  const preview = mandates.slice(0, CAUGHT_PREVIEW).map(row).join('');
  const rest = mandates.slice(CAUGHT_PREVIEW);
  const restHtml = rest.length ? `
    <details class="caught-more">
      <summary>Show all ${mandates.length}</summary>
      ${rest.map(row).join('')}
    </details>
  ` : '';

  return `
    <details class="tracker-caught">
      <summary class="tracker-label">Mandates we caught (full list) — ${mandates.length}</summary>
      <div class="caught-list">
        ${preview}
        ${restHtml}
      </div>
      <div class="tracker-subnote">Each row is a deal DealBrief caught in its coverage, verified from a primary source. Verify Reported items before quoting on a call.</div>
    </details>
  `;
}

function renderBankNewsCard(item) {
  const urgencyType = urgencyToBadgeType(item.urgency);
  const dealClockHtml = item.deal_clock?.length ? `
    <div class="deal-clock">
      <div class="deal-clock-title">Deal Clock</div>
      <div class="deal-clock-items">
        ${item.deal_clock.map(d => `
          <div class="deal-clock-item">
            <span class="deal-clock-date">${esc(d.date)}</span>
            <span class="deal-clock-event">${esc(d.event)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="card expanded" style="margin-bottom:var(--space-3);">
      <div class="card-header" onclick="this.closest('.card').classList.toggle('expanded')">
        <div class="card-headline-wrap">
          <div class="card-badges">
            <span class="badge badge-category">${esc(item.category)}</span>
            <span class="badge badge-${urgencyType}">${esc(item.urgency)}</span>
          </div>
          <h3 class="card-headline mt-2">${esc(item.headline)}</h3>
        </div>
        <span class="card-toggle">›</span>
      </div>
      <div class="card-body">
        <div class="card-section">
          <div class="card-section-label">Why it Matters</div>
          <div class="card-section-text">${esc(item.why_it_matters)}</div>
        </div>
        <div class="card-section">
          <div class="card-section-label">Suggested Action</div>
          <div class="card-section-text">${esc(item.suggested_action)}</div>
        </div>
        ${dealClockHtml}
        <div class="card-footer">
          <div class="card-footer-left">
            ${item.source_url ? `<a href="${esc(item.source_url)}" target="_blank" rel="noopener" class="source-link">${esc(item.source)} ↗</a>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderBankDealCard(deal) {
  return `
    <div class="card" style="margin-bottom:var(--space-3);">
      <div class="card-header" style="cursor:default;">
        <div class="card-headline-wrap">
          <div class="card-badges">
            <span class="badge badge-category">${esc(deal.sector)}</span>
            <span class="badge badge-category">${esc(deal.role)}</span>
          </div>
          <h3 class="card-headline mt-2">${esc(deal.company)}</h3>
          <div class="deal-card-meta" style="margin-top:var(--space-2);">
            <span class="deal-meta-item">${esc(deal.size)}</span>
            <span class="deal-meta-dot">·</span>
            <span class="deal-meta-item">${esc(deal.stage)}</span>
            ${deal.announced ? `<span class="deal-meta-dot">·</span><span class="deal-meta-item">Announced ${esc(deal.announced)}</span>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════
   DEALS PAGE
   ══════════════════════════════════════════════════════════ */

let allDeals = [];

export async function initDeals() {
  try {
    const data = await fetchData('deals.json');
    allDeals = data.deals || [];
    renderDealsFilters();
    renderDeals(allDeals);
  } catch (err) {
    console.error('Failed to load deals:', err);
  }
}

// Deal-row banks: always a banks[] array in the regenerated file, but tolerate
// a legacy single-string just in case.
function dealBanks(deal) {
  return Array.isArray(deal.banks) ? deal.banks : (deal.banks ? [deal.banks] : (deal.advisor ? [deal.advisor] : []));
}

function renderDealsFilters() {
  const container = document.getElementById('deals-filters');
  if (!container) return;

  // Industry options from coverage_team, advisor options from banks[].
  const industries = [...new Set(allDeals.flatMap(d => Array.isArray(d.coverage_team) ? d.coverage_team : (d.coverage_team ? [d.coverage_team] : [])))].sort();
  const advisors   = [...new Set(allDeals.flatMap(dealBanks))].sort();

  container.innerHTML = `
    <div class="search-input-wrap">
      <span class="search-icon">⌕</span>
      <input
        type="text"
        class="search-input"
        id="deals-search"
        placeholder="Search deals, companies, advisers..."
        oninput="window._filterDeals()"
      />
    </div>
    <select class="filter-select" id="filter-industry" onchange="window._filterDeals()">
      <option value="">All Industries</option>
      ${industries.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
    </select>
    <select class="filter-select" id="filter-advisor" onchange="window._filterDeals()">
      <option value="">All Advisers</option>
      ${advisors.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
    </select>
    <select class="filter-select" id="filter-confidence" onchange="window._filterDeals()">
      <option value="">All Confidence</option>
      <option value="Filed">Confirmed</option>
      <option value="Reported">Verify first</option>
      <option value="Speculative">Rumor</option>
    </select>
  `;

  window._filterDeals = () => {
    const search     = document.getElementById('deals-search')?.value.toLowerCase() || '';
    const industry   = document.getElementById('filter-industry')?.value || '';
    const advisor    = document.getElementById('filter-advisor')?.value || '';
    const confidence = document.getElementById('filter-confidence')?.value || '';

    const filtered = allDeals.filter(d => {
      const banks = dealBanks(d);
      const teams = Array.isArray(d.coverage_team) ? d.coverage_team : (d.coverage_team ? [d.coverage_team] : []);
      const matchSearch = !search || [d.headline, d.sector, ...banks].some(f => f?.toLowerCase().includes(search));
      const matchIndustry = !industry || teams.includes(industry);
      const matchAdvisor  = !advisor  || banks.some(b => b === advisor);
      const matchConf     = !confidence || d.confidence === confidence;
      return matchSearch && matchIndustry && matchAdvisor && matchConf;
    });

    renderDeals(filtered);
  };
}

function renderDeals(deals) {
  const container = document.getElementById('deals-list');
  if (!container) return;

  const countEl = document.getElementById('deals-count');
  if (countEl) countEl.textContent = `${deals.length} deal${deals.length === 1 ? '' : 's'}`;

  if (deals.length === 0) {
    container.innerHTML = `<div class="no-results">No deals match your filters.</div>`;
    return;
  }

  const teamBadges = d => {
    const teams = Array.isArray(d.coverage_team) ? d.coverage_team : (d.coverage_team ? [d.coverage_team] : []);
    return teams.map(t => `<span class="badge badge-team" title="Covering group at the advising bank">${esc(t)}</span>`).join('');
  };

  container.innerHTML = deals.map(deal => {
    const banks = dealBanks(deal);
    const myBank = isMyBankAny(banks);
    return `
      <div class="card expanded deal-archive-card" data-deal-id="${esc(deal.id)}">
        <div class="card-header" style="cursor:default;">
          <div class="card-headline-wrap">
            <div class="card-badges">
              ${deal.confidence ? `<span class="badge badge-conf-${esc(deal.confidence.toLowerCase())}" title="${esc(deal.confidence)} — ${esc(confidenceTooltip(deal.confidence))}">${esc(confidenceLabel(deal.confidence))}</span>` : ''}
              ${teamBadges(deal)}
              ${myBank ? '<span class="badge badge-your-bank">YOUR BANK</span>' : ''}
            </div>
            <h3 class="card-headline mt-2">${esc(deal.headline)}</h3>
            <div class="deal-card-meta">
              ${banks.length ? `<span class="deal-meta-item">${esc(banks.join(', '))}</span>` : ''}
            </div>
            <div class="caught-meta" style="margin-top:var(--space-2);">
              ${deal.published ? `<span class="source-date font-mono">${esc(deal.published)}</span>` : ''}
              ${deal.source_url ? `<a href="${esc(deal.source_url)}" target="_blank" rel="noopener" class="source-link">${esc(deal.source || 'Source')} ↗</a>` : (deal.source ? `<span class="pipeline-source">${esc(deal.source)}</span>` : '')}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   RESOURCES PAGE
   ══════════════════════════════════════════════════════════ */

export async function initResources() {
  try {
    const data = await fetchData('resources.json');
    renderResources(data.reports);
  } catch (err) {
    console.error('Failed to load resources:', err);
  }
}

function renderResources(reports) {
  const container = document.getElementById('resources-grid');
  if (!container || !reports) return;

  container.innerHTML = reports.map(r => `
    <div class="report-card">
      <div class="report-card-head">
        <span class="report-publisher">${esc(r.publisher)}</span>
        <span class="report-date">${esc(r.date)}</span>
      </div>
      <h3 class="report-title">${esc(r.title)}</h3>
      <p class="report-summary">${esc(r.summary)}</p>
      <div class="report-meta">
        ${r.key_stat ? `<span class="report-stat">${esc(r.key_stat)}</span>` : ''}
        ${r.sector ? `<span class="report-sector">${esc(r.sector)}</span>` : ''}
      </div>
      <a href="${esc(r.url)}" target="_blank" rel="noopener" class="btn btn-primary report-link">Read report ↗</a>
    </div>
  `).join('');
}
