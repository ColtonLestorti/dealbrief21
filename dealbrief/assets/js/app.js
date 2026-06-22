/* ============================================================
   app.js — Main application controller
   Handles routing, navigation, modal, settings, and init.
   ============================================================ */

import { initOnboarding, resetOnboarding } from './onboarding.js';
import { initToday } from './today.js';
import { initBanks, initDeals, initResources } from './pages.js';
import { getPrefs, savePrefs, copyToClipboard, esc } from './utils.js';

/* ── State ──────────────────────────────────────────────── */
let currentPage = 'today';
const pageInitialized = { today: false, banks: false, deals: false, resources: false };

/* ── Router ──────────────────────────────────────────────── */
function navigateTo(page) {
  if (currentPage === page) return;

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  // Show target page
  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  currentPage = page;
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Lazy init pages
  if (!pageInitialized[page]) {
    pageInitialized[page] = true;
    switch (page) {
      case 'today':     initToday(); break;
      case 'banks':     initBanks(); break;
      case 'deals':     initDeals(); break;
      case 'resources': initResources(); break;
    }
  }
}

/* ── Navigation Events ───────────────────────────────────── */
function initNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const page = link.dataset.page;
      if (page) navigateTo(page);
    });
  });

  // Clicking the brand/logo returns to Today.
  const brand = document.querySelector('.nav-brand');
  brand?.addEventListener('click', e => {
    e.preventDefault();
    navigateTo('today');
  });
}

/* ── Settings Panel ──────────────────────────────────────── */
function initSettings() {
  const btn     = document.getElementById('settings-btn');
  const overlay = document.getElementById('settings-overlay');
  const closeBtn = document.getElementById('settings-close');
  const resetBtn = document.getElementById('settings-reset');

  btn?.addEventListener('click', () => {
    renderSettingsContent();
    overlay?.classList.add('open');
  });

  closeBtn?.addEventListener('click', () => overlay?.classList.remove('open'));

  overlay?.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  document.getElementById('settings-edit-banks')?.addEventListener('click', () => {
    overlay?.classList.remove('open');
    triggerResetOnboarding();
  });

  document.getElementById('settings-edit-industries')?.addEventListener('click', () => {
    overlay?.classList.remove('open');
    triggerResetOnboarding();
  });

  resetBtn?.addEventListener('click', () => {
    if (confirm('Reset DealBrief? This will clear your bank and industry selections.')) {
      triggerResetOnboarding();
      overlay?.classList.remove('open');
    }
  });
}

function renderSettingsContent() {
  const prefs = getPrefs();
  const banksEl = document.getElementById('settings-banks-value');
  const industriesEl = document.getElementById('settings-industries-value');

  if (banksEl) {
    banksEl.textContent = prefs?.banks?.length
      ? prefs.banks.join(', ')
      : 'None selected';
  }
  if (industriesEl) {
    industriesEl.textContent = prefs?.industries?.length
      ? prefs.industries.join(', ')
      : 'None selected';
  }
}

function triggerResetOnboarding() {
  // Reset page initialization so pages re-render with new prefs
  Object.keys(pageInitialized).forEach(k => pageInitialized[k] = false);

  resetOnboarding((prefs) => {
    navigateTo('today');
    // Re-init today page with fresh prefs
    pageInitialized.today = true;
    initToday();
  });
}

/* ── Outreach Modal ──────────────────────────────────────── */
function initModal() {
  const overlay = document.getElementById('modal-overlay');
  const closeBtn = document.getElementById('modal-close');
  const copyBtn  = document.getElementById('modal-copy');

  closeBtn?.addEventListener('click', () => overlay?.classList.remove('open'));

  overlay?.addEventListener('click', e => {
    if (e.target === overlay) overlay?.classList.remove('open');
  });

  copyBtn?.addEventListener('click', () => {
    const subject = document.getElementById('modal-subject')?.textContent || '';
    const body    = document.getElementById('modal-body-text')?.textContent || '';
    copyToClipboard(`Subject: ${subject}\n\n${body}`, 'Email copied to clipboard');
  });

  // Global opener used by today.js and pages.js
  window._openOutreachModal = (id, source = 'opportunity') => {
    let item = null;

    if (source === 'deal') {
      item = window._dealsData?.find(d => d.id === id);
    } else {
      item = window._opportunitiesData?.find(o => o.id === id)
          || window._dealsData?.find(d => d.id === id);
    }

    if (!item || !item.outreach_draft) return;

    const draft = item.outreach_draft;
    const titleEl    = document.getElementById('modal-title');
    const subtitleEl = document.getElementById('modal-subtitle');
    const subjectEl  = document.getElementById('modal-subject');
    const bodyEl     = document.getElementById('modal-body-text');

    if (titleEl)    titleEl.textContent    = `Outreach Draft · ${item.bank || item.advisor || item.company}`;
    if (subtitleEl) subtitleEl.textContent = item.headline || item.company;
    if (subjectEl)  subjectEl.textContent  = draft.subject;
    if (bodyEl)     bodyEl.textContent     = draft.body;

    overlay?.classList.add('open');
  };
}

/* ── Keyboard shortcuts ──────────────────────────────────── */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('modal-overlay')?.classList.remove('open');
      document.getElementById('settings-overlay')?.classList.remove('open');
    }
  });
}

/* ── Bootstrap ───────────────────────────────────────────── */
function boot() {
  initNavigation();
  initSettings();
  initModal();
  initKeyboard();

  // Start onboarding flow — navigates to today on completion
  initOnboarding((prefs) => {
    navigateTo('today');
    pageInitialized.today = true;
    initToday();
  });
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
