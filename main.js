/**
 * main.js — Composition Root (punctul de bootstrap al aplicației)
 * =============================================================================
 * Acest fișier face UN lucru: pornește aplicația în ordinea corectă.
 * Nu conține logică de business — delege tot către store.js, ui.js, security.js.
 *
 * ORDINEA DE INIȚIALIZARE contează:
 *   1. Store.init()       — hidratează starea din localStorage
 *   2. Store.setMessages  — injectează mesajele RO înainte ca UI să poată arunca erori
 *   3. UI.init()          — montează DOM, abonează la store, desenează graful inițial
 *   4. setStorageErrorReporter — wiring callbacks după ce UI.announce e gata
 *
 * EXPUNERE CONSOLĂ (dev mode):
 *   Juratul poate testa securitatea live, fără build tool sau extensii:
 *     __mently.Security.escapeHtml('<script>alert(1)</script>')
 *     __mently.Store.addNote({title: '<img src=x onerror=alert(1)>', tags: []})
 * =============================================================================
 */

import * as Store from './store.js';
import * as UI from './ui.js';
import * as Security from './security.js';
import { t } from './i18n.js';

function boot() {
  try {
    Store.init();

    // Injectăm mesajele localizate în store ÎNAINTE de UI.init() — altfel primele
    // erori aruncate (dacă localStorage e corupt) ar apărea cu text englezesc.
    Store.setMessages(t.errors);

    UI.init();

    // Callback-ul de storage errors e wired după UI.init() pentru că UI.announce
    // are nevoie de elementul aria-live montat de UI.
    Store.setStorageErrorReporter((type) => {
      const msg = type === 'quota' ? t.errors.storageQuota : t.errors.storageDisabled;
      UI.announce(msg);
    });

    if (isDev()) {
      // isDev() verifică hostname-ul, nu o variabilă de build.
      // DE CE: nu avem un build step și deci nu există process.env.NODE_ENV.
      // Hostname '' acoperă cazul file:// (deschis direct din explorer).
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

/* ─────────────────────────── Error handling global ─────────────────────────── */

// Prinde erori necaptate din orice modul — util mai ales în dev când un modul
// terț sau un listener async aruncă fără try/catch.
window.addEventListener('error', (e) => {
  console.error('[Mently] Uncaught error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Mently] Unhandled promise rejection:', e.reason);
});

/**
 * Afișează un ecran de eroare fatală dacă boot() eșuează.
 *
 * DE CE nu folosim escapeHtml din security.js:
 *   security.js este unul dintre primele module încărcate. Dacă boot() a eșuat,
 *   există șansa ca security.js însuși să fi cauzat eroarea (import eșuat, syntax
 *   error într-o versiune viitoare). Nu ne putem baza pe el. Deci duplicăm
 *   mini-escape-ul inline — 5 rânduri care nu pot eșua.
 */
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

/**
 * Escape minimal pentru ecranul de eroare fatală.
 * Nu folosim security.js — vezi nota de mai sus din renderFatalError.
 */
function escapeForErrorView(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Detectează mediul de dezvoltare după hostname, nu după variabilă de build.
 * De ce hostname: nu avem build step → process.env.NODE_ENV nu există.
 * '' acoperă cazul file:// (fișier deschis direct din Windows Explorer).
 */
function isDev() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}