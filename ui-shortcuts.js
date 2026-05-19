// Keyboard shortcuts overlay. Press '?' to open, Escape to close.

import { t } from './i18n.js';
import { escapeHtml } from './security.js';

let overlayEl = null;

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

  document.addEventListener('keydown', (e) => {
    if (overlayEl.classList.contains('hidden')) {
      // Open on '?' — skip if focus is in an input/textarea
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
  overlayEl.classList.remove('hidden');
  overlayEl.querySelector('#shortcuts-close').focus();
}

function close() {
  overlayEl.classList.add('hidden');
}

function isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function renderModal() {
  const rows = [
    { desc: 'Shortcuts help',      keys: ['?'] },
    { desc: 'Close / cancel',       keys: ['Esc'] },
    { desc: 'Navigate elements',    keys: ['Tab', 'Shift+Tab'] },
    { desc: 'Activate selected',    keys: ['Enter'] },
    { desc: 'Focus mode — prev',    keys: ['←'] },
    { desc: 'Focus mode — next',    keys: ['→'] },
    { desc: 'Fullscreen toggle',    keys: ['F'] },
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
        <span id="shortcuts-title" class="shortcuts-modal-title">Keyboard Shortcuts</span>
        <button id="shortcuts-close" class="shortcuts-modal-close" aria-label="Close shortcuts">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      ${rowsHtml}
    </div>
  `;
}
