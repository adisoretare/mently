/**
 * main.js — Composition Root (Bootstrap aplicație)
 * =============================================================================
 * REFACTOR (Pasul 4): expune Security în __mently pentru testare/demo în consolă.
 * Juratul poate proba live că XSS-ul e blocat:
 *   __mently.Security.escapeHtml('<script>alert(1)</script>')
 *   __mently.Store.addNote({title: '<img src=x onerror=alert(1)>', tags: []})
 * =============================================================================
 */

import * as Store from './store.js';
import * as UI from './ui.js';
import * as Security from './security.js';

function boot() {
  try {
    Store.init();
    UI.init();

    if (isDev()) {
      window.__mently = { Store, UI, Security };
      console.info(
        '%c[Mently]%c dev mode\n' +
        '  __mently.Store.addNote({title:"...", content:"...", tags:["..."]})\n' +
        '  __mently.Security.escapeHtml(\'<script>xss</script>\')',
        'color:#fb923c;font-weight:bold',
        'color:inherit'
      );
    }

    console.info('[Mently] Initialized ✓');
  } catch (err) {
    renderFatalError(err);
  }
}

/* ─────────────────────────── Error handling ─────────────────────────── */

window.addEventListener('error', (e) => {
  console.error('[Mently] Uncaught error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Mently] Unhandled promise rejection:', e.reason);
});

function renderFatalError(err) {
  const msg = (err && err.message) ? err.message : 'Eroare necunoscută';
  document.body.innerHTML = `
    <div role="alert" class="h-screen flex items-center justify-center bg-ink-950 text-paper-100 px-6">
      <div class="max-w-md text-center">
        <p class="font-display italic text-5xl text-signal-400 leading-none">Oops.</p>
        <h1 class="mt-4 text-lg font-medium">Aplicația nu a putut porni.</h1>
        <p class="mt-2 text-sm text-paper-500 font-mono">${escapeForErrorView(msg)}</p>
        <p class="mt-6 text-xs text-paper-500/70">
          Încearcă să reîncarci pagina. Dacă persistă, șterge datele site-ului din browser.
        </p>
      </div>
    </div>
  `;
}

/** Mini-escape DOAR pentru fallback (evită dependență circulară). */
function escapeForErrorView(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isDev() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}