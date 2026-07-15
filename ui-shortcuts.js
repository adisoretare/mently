// ui-shortcuts.js — Overlay-ul cu scurtăturile de tastatură.
// Se deschide cu tasta '?' și se închide cu Escape sau click în afara modalului.
// Dialog modal complet: focus trap (Tab ciclează în interior) + focus restore la închidere.
// Rândurile din tabel vin din i18n, deci lista se traduce odată cu restul aplicației.

import { t } from './i18n.js';
import { escapeHtml } from './security.js';
import { allFocusable } from './dom.js';

let overlayEl = null;
let previouslyFocused = null;

/**
 * Construiește overlay-ul (ascuns inițial), îl atașează la <body>
 * și instalează ascultătorii pentru deschidere/închidere.
 */
export function init() {
  overlayEl = document.createElement('div');
  overlayEl.className = 'shortcuts-overlay hidden';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-labelledby', 'shortcuts-title');
  overlayEl.innerHTML = renderModal();
  document.body.appendChild(overlayEl);

  overlayEl.querySelector('#shortcuts-close').addEventListener('click', close);
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });
  overlayEl.addEventListener('keydown', handleTrapKeydown);

  document.addEventListener('keydown', (e) => {
    if (overlayEl.classList.contains('hidden')) {
      // Deschidem la '?' — dar nu când focus-ul e într-un input/textarea
      // (acolo utilizatorul chiar vrea să tasteze semnul întrebării)
      if (e.key === '?' && !isInputFocused()) {
        e.preventDefault();
        open();
      }
    } else {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
  });
}

function open() {
  // Reținem cine avea focus-ul, ca să i-l putem restitui la închidere
  previouslyFocused = document.activeElement;
  overlayEl.classList.remove('hidden');
  overlayEl.querySelector('#shortcuts-close').focus();
}

function close() {
  overlayEl.classList.add('hidden');
  // Restituim focus-ul elementului care a deschis modalul (pattern ARIA dialog)
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}

/**
 * Focus trap: cât timp modalul e deschis, Tab/Shift+Tab ciclează în interior.
 * Același pattern ca în ui-drawer.js (handleSidebarKeydown).
 */
function handleTrapKeydown(e) {
  if (overlayEl.classList.contains('hidden') || e.key !== 'Tab') return;
  const focusables = allFocusable(overlayEl);
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function renderModal() {
  const rows = [
    { desc: t.shortcuts.rows.help,       keys: ['?'] },
    { desc: t.shortcuts.rows.close,      keys: ['Esc'] },
    { desc: t.shortcuts.rows.navigate,   keys: ['Tab', 'Shift+Tab'] },
    { desc: t.shortcuts.rows.activate,   keys: ['Enter'] },
    { desc: t.shortcuts.rows.focusPrev,  keys: ['←'] },
    { desc: t.shortcuts.rows.focusNext,  keys: ['→'] },
    { desc: t.shortcuts.rows.fullscreen, keys: ['F'] },
    { desc: t.shortcuts.rows.undo,       keys: ['Ctrl+Z'] },
    { desc: t.shortcuts.rows.redo,       keys: ['Ctrl+Shift+Z'] },
  ];

  const rowsHtml = rows.map(({ desc, keys }) => `
    <div class="shortcuts-row">
      <span class="shortcuts-desc">${escapeHtml(desc)}</span>
      <span class="shortcuts-keys">${keys.map(k => `<kbd>${escapeHtml(k)}</kbd>`).join('')}</span>
    </div>
  `).join('');

  return `
    <div class="shortcuts-modal" role="document">
      <div class="shortcuts-modal-header">
        <span id="shortcuts-title" class="shortcuts-modal-title">${escapeHtml(t.shortcuts.title)}</span>
        <button id="shortcuts-close" class="shortcuts-modal-close" aria-label="${escapeHtml(t.shortcuts.close)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      ${rowsHtml}
    </div>
  `;
}
