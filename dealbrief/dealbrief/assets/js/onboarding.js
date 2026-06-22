/* ============================================================
   onboarding.js — First-time setup flow
   Handles 3-step onboarding and writes prefs to localStorage.
   ============================================================ */

import { savePrefs, getPrefs } from './utils.js';

// Full NYC coverage universe, grouped by tier.
// Labels here must match the "name" field in banks.json exactly.
const BANK_GROUPS = [
  {
    tier: 'Bulge Bracket',
    banks: ['Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'Bank of America',
            'Citi', 'Barclays', 'Deutsche Bank', 'UBS', 'Wells Fargo', 'RBC Capital Markets']
  },
  {
    tier: 'Elite Boutique',
    banks: ['Evercore', 'Lazard', 'Centerview Partners', 'Moelis', 'PJT Partners',
            'Perella Weinberg', 'Guggenheim Securities', 'Greenhill & Co']
  },
  {
    tier: 'Middle Market',
    banks: ['Houlihan Lokey', 'Jefferies', 'William Blair', 'Lincoln International',
            'Harris Williams', 'Baird', 'Piper Sandler', 'Raymond James', 'Stifel', 'TD Cowen']
  }
];

// Flat list for any code that just needs all names.
const BANKS = BANK_GROUPS.flatMap(g => g.banks);

const INDUSTRIES = [
  'Healthcare', 'Technology', 'Industrials', 'Consumer',
  'Financial Institutions', 'Energy', 'Software', 'Business Services'
];

let currentStep = 1;
const selections = { banks: [], industries: [] };

/**
 * Initialize the onboarding module.
 * If prefs already exist, skip onboarding.
 * @param {Function} onComplete — called when onboarding finishes
 */
export function initOnboarding(onComplete) {
  const prefs = getPrefs();
  const el = document.getElementById('onboarding');

  if (prefs && prefs.banks && prefs.banks.length > 0) {
    // Already onboarded — hide and proceed
    el.style.display = 'none';
    onComplete(prefs);
    return;
  }

  // Build and show onboarding
  renderOnboarding(el, onComplete);
}

/**
 * Force reset onboarding (called from Settings).
 * @param {Function} onComplete
 */
export function resetOnboarding(onComplete) {
  localStorage.removeItem('dealbrief_prefs');
  const el = document.getElementById('onboarding');
  el.style.display = 'flex';
  currentStep = 1;
  selections.banks = [];
  selections.industries = [];
  renderOnboarding(el, onComplete);
}

function renderOnboarding(el, onComplete) {
  el.innerHTML = `
    <div class="onboarding-wrap">
      <!-- Step 1: Welcome -->
      <div class="onboarding-step active" data-step="1">
        <div class="onboarding-progress">
          <div class="progress-dot active" data-dot="1"></div>
          <div class="progress-dot" data-dot="2"></div>
          <div class="progress-dot" data-dot="3"></div>
        </div>
        <div class="onboarding-eyebrow">DealBrief · Banking & Capital Advisory</div>
        <h1 class="onboarding-title">Your daily edge for M&amp;A Advisory.</h1>
        <p class="onboarding-subtitle">
          Intelligence on the banks you cover, the deals that matter, and exactly what to say on your next call.
        </p>
        <div class="welcome-meta">
          <div class="welcome-meta-item">
            <div class="welcome-meta-dot"></div>
            Takes 30 seconds
          </div>
          <div class="welcome-meta-item">
            <div class="welcome-meta-dot"></div>
            No login required
          </div>
          <div class="welcome-meta-item">
            <div class="welcome-meta-dot"></div>
            Saved to this device
          </div>
        </div>
        <div class="onboarding-footer">
          <span></span>
          <button class="btn-onboarding" id="ob-next-1">
            Get Started
            <span>→</span>
          </button>
        </div>
      </div>

      <!-- Step 2: Banks -->
      <div class="onboarding-step" data-step="2">
        <div class="onboarding-progress">
          <div class="progress-dot done" data-dot="1"></div>
          <div class="progress-dot active" data-dot="2"></div>
          <div class="progress-dot" data-dot="3"></div>
        </div>
        <div class="onboarding-eyebrow">Step 2 of 3</div>
        <h2 class="onboarding-title">Which banks do you cover?</h2>
        <p class="onboarding-instruction">Select all that apply. Your dashboard will prioritize news and deals from these firms.</p>
        <div id="bank-pills">
          ${BANK_GROUPS.map(group => `
            <div class="selection-group">
              <div class="selection-group-label">${group.tier}</div>
              <div class="selection-grid">
                ${group.banks.map(b => `
                  <div class="selection-pill" data-value="${b}" data-group="banks">
                    <span class="selection-pill-check">✓</span>
                    ${b}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="onboarding-footer">
          <button class="onboarding-back" id="ob-back-2">← Back</button>
          <button class="btn-onboarding" id="ob-next-2">
            Continue
            <span>→</span>
          </button>
        </div>
      </div>

      <!-- Step 3: Industries -->
      <div class="onboarding-step" data-step="3">
        <div class="onboarding-progress">
          <div class="progress-dot done" data-dot="1"></div>
          <div class="progress-dot done" data-dot="2"></div>
          <div class="progress-dot active" data-dot="3"></div>
        </div>
        <div class="onboarding-eyebrow">Step 3 of 3</div>
        <h2 class="onboarding-title">What industries do you cover?</h2>
        <p class="onboarding-instruction">This helps surface the most relevant deals and opportunities for your territory.</p>
        <div class="selection-grid" id="industry-pills">
          ${INDUSTRIES.map(i => `
            <div class="selection-pill" data-value="${i}" data-group="industries">
              <span class="selection-pill-check">✓</span>
              ${i}
            </div>
          `).join('')}
        </div>
        <div class="onboarding-footer">
          <button class="onboarding-back" id="ob-back-3">← Back</button>
          <button class="btn-onboarding" id="ob-finish">
            Create My Dashboard
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  `;

  bindOnboardingEvents(el, onComplete);
}

function bindOnboardingEvents(el, onComplete) {
  // Selection pills toggle
  el.addEventListener('click', e => {
    const pill = e.target.closest('.selection-pill');
    if (!pill) return;

    const group = pill.dataset.group;
    const value = pill.dataset.value;

    pill.classList.toggle('selected');

    if (pill.classList.contains('selected')) {
      if (!selections[group].includes(value)) selections[group].push(value);
    } else {
      selections[group] = selections[group].filter(v => v !== value);
    }
  });

  // Step navigation
  document.getElementById('ob-next-1').addEventListener('click', () => goToStep(2));
  document.getElementById('ob-next-2').addEventListener('click', () => goToStep(3));
  document.getElementById('ob-back-2').addEventListener('click', () => goToStep(1));
  document.getElementById('ob-back-3').addEventListener('click', () => goToStep(2));

  document.getElementById('ob-finish').addEventListener('click', () => {
    const prefs = {
      banks: selections.banks,
      industries: selections.industries,
      onboarded: true,
      onboardedAt: new Date().toISOString()
    };
    savePrefs(prefs);
    el.style.display = 'none';
    onComplete(prefs);
  });
}

function goToStep(n) {
  const steps = document.querySelectorAll('.onboarding-step');
  steps.forEach(s => s.classList.remove('active'));
  document.querySelector(`.onboarding-step[data-step="${n}"]`).classList.add('active');
  currentStep = n;
}
