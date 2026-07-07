/* ============================================================
   pages.js — Banks, Deals, and Resources page renderers
   ============================================================ */

import { fetchData, esc, urgencyToBadgeType, getPrefs, copyToClipboard } from './utils.js';

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

  const fmtEarnings = (d) => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt)) return esc(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const signalHtml = tracker.advisory_signal ? `
    <div class="tracker-signal">
      <div class="tracker-label">Advisory Signal</div>
      <div class="tracker-signal-text">${esc(tracker.advisory_signal.rank)}</div>
      <a href="${esc(tracker.advisory_signal.source_url)}" target="_blank" rel="noopener" class="source-link">
        ${esc(tracker.advisory_signal.source)} · ${esc(tracker.advisory_signal.period)} ↗
      </a>
    </div>
  ` : '';

  const earningsHtml = tracker.next_earnings ? `
    <div class="tracker-stat">
      <div class="tracker-stat-num">${fmtEarnings(tracker.next_earnings)}</div>
      <div class="tracker-stat-label">Next earnings</div>
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

  return `
    <div class="bank-tracker">
      <div class="tracker-row">
        <div class="tracker-stat">
          <div class="tracker-stat-num">${tracker.mandates_30d}</div>
          <div class="tracker-stat-label">Mandates (30d)</div>
        </div>
        <div class="tracker-stat">
          <div class="tracker-stat-num">${tracker.mandates_total}</div>
          <div class="tracker-stat-label">Tracked total</div>
        </div>
        ${earningsHtml}
      </div>
      ${signalHtml}
      ${pipelineHtml}
      <div class="tracker-note">${esc(tracker.note)}</div>
    </div>
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
let activeFilters = { search: '', sector: '', stage: '', bank: '' };

export async function initDeals() {
  try {
    const data = await fetchData('deals.json');
    allDeals = data.deals;
    renderDealsFilters();
    renderDeals(allDeals);
  } catch (err) {
    console.error('Failed to load deals:', err);
  }
}

function renderDealsFilters() {
  const container = document.getElementById('deals-filters');
  if (!container) return;

  const sectors = [...new Set(allDeals.map(d => d.sector))].sort();
  const stages  = [...new Set(allDeals.map(d => d.stage))].sort();
  const banks   = [...new Set(allDeals.map(d => d.advisor))].sort();

  container.innerHTML = `
    <div class="search-input-wrap">
      <span class="search-icon">⌕</span>
      <input
        type="text"
        class="search-input"
        id="deals-search"
        placeholder="Search deals, companies, advisors..."
        oninput="window._filterDeals()"
      />
    </div>
    <select class="filter-select" id="filter-sector" onchange="window._filterDeals()">
      <option value="">All Sectors</option>
      ${sectors.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
    </select>
    <select class="filter-select" id="filter-stage" onchange="window._filterDeals()">
      <option value="">All Stages</option>
      ${stages.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
    </select>
    <select class="filter-select" id="filter-bank" onchange="window._filterDeals()">
      <option value="">All Advisors</option>
      ${banks.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
    </select>
  `;

  window._filterDeals = () => {
    const search = document.getElementById('deals-search')?.value.toLowerCase() || '';
    const sector = document.getElementById('filter-sector')?.value || '';
    const stage  = document.getElementById('filter-stage')?.value || '';
    const bank   = document.getElementById('filter-bank')?.value || '';

    const filtered = allDeals.filter(d => {
      const matchSearch = !search || [d.company, d.advisor, d.sector, d.buyer, d.seller]
        .some(f => f?.toLowerCase().includes(search));
      const matchSector = !sector || d.sector === sector;
      const matchStage  = !stage  || d.stage === stage;
      const matchBank   = !bank   || d.advisor === bank;
      return matchSearch && matchSector && matchStage && matchBank;
    });

    renderDeals(filtered);
  };
}

function renderDeals(deals) {
  const container = document.getElementById('deals-list');
  if (!container) return;

  if (deals.length === 0) {
    container.innerHTML = `<div class="no-results">No deals match your filters.</div>`;
    return;
  }

  container.innerHTML = deals.map((deal, index) => {
    const prefs = getPrefs();
    const myBank = prefs?.banks?.some(b => b.toLowerCase() === deal.advisor?.toLowerCase());

    const dealClockHtml = deal.deal_clock?.length ? `
      <div class="deal-clock">
        <div class="deal-clock-title">Deal Clock</div>
        <div class="deal-clock-items">
          ${deal.deal_clock.map(d => `
            <div class="deal-clock-item">
              <span class="deal-clock-date">${esc(d.date)}</span>
              <span class="deal-clock-event">${esc(d.event)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    return `
      <div class="card ${index === 0 ? 'expanded' : ''}" data-deal-id="${deal.id}">
        <div class="card-header" onclick="this.closest('.card').classList.toggle('expanded')">
          <div class="card-headline-wrap">
            <div class="card-badges">
              <span class="badge badge-category">${esc(deal.sector)}</span>
              <span class="badge badge-category">${esc(deal.stage)}</span>
              ${myBank ? '<span class="badge badge-your-bank">YOUR BANK</span>' : ''}
            </div>
            <h3 class="card-headline mt-2">${esc(deal.company)}</h3>
            <div class="deal-card-meta">
              <span class="deal-meta-item">${esc(deal.size)}</span>
              <span class="deal-meta-dot">·</span>
              <span class="deal-meta-item">${esc(deal.advisor_role)} · ${esc(deal.advisor)}</span>
              ${deal.buyer && deal.buyer !== 'TBD' && deal.buyer !== 'N/A'
                ? `<span class="deal-meta-dot">·</span><span class="deal-meta-item">Buyer: ${esc(deal.buyer)}</span>`
                : ''}
            </div>
          </div>
          <span class="card-toggle">›</span>
        </div>
        <div class="card-body">
          <div class="card-section">
            <div class="card-section-label">Why it Matters</div>
            <div class="card-section-text">${esc(deal.why_it_matters)}</div>
          </div>
          ${dealClockHtml}
          <div class="card-footer">
            <div class="card-footer-left"></div>
            <div class="card-footer-right">
              <button class="btn btn-primary" onclick="event.stopPropagation(); window._openOutreachModal('${esc(deal.id)}', 'deal')">
                ✉ View Outreach Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Store deals data for modal access
  window._dealsData = deals;
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
