/**
 * main.js — Composition Root (Bootstrap aplicație)
 * =============================================================================
 * DECIZIE ARHITECTURALĂ (Cap. I — Modularitate):
 *
 * Composition Root explicit. Toate dependențele între module sunt rezolvate
 * într-un singur loc. Modulele individuale NU se cunosc între ele direct decât
 * prin API-urile lor publice (export-uri). Beneficii:
 *
 *   - testabilitate: poți înlocui Store cu un mock în teste fără să atingi ui.js
 *   - readability: dacă deschizi proiectul prima dată, main.js îți spune flow-ul
 *   - inversion of control: dependențele "curg" de sus în jos
 *
 * Acest fișier face EXACT trei lucruri:
 *   1. Inițializează store-ul (hidratare din localStorage)
 *   2. Inițializează UI-ul (atașează listeners, render)
 *   3. Gestionează erorile globale (uncaught + promise rejection)
 * =============================================================================
 */

import * as Store from './store.js';
import * as UI from './ui.js';

/* ─────────────────────────── Boot ─────────────────────────── */

function boot() {
  try {
    // 1. Data layer
    Store.init();

    // 2. View layer
    UI.init();

    // 3. Dev-mode helpers (DOAR pe localhost; nu expunem în producție)
    if (isDev()) {
      window.__mently = { Store, UI };
      console.info(
        '%c[Mently]%c dev mode — încearcă:\n  __mently.Store.addNote({title:"Linear Algebra", content:"Eigenvalues...", tags:["math","linalg"]})',
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

/**
 * Programare defensivă (Cap. V): orice eroare neprinsă e capturată și logată,
 * iar utilizatorul primește feedback vizual în loc de o pagină goală/înghețată.
 */
window.addEventListener('error', (e) => {
  console.error('[Mently] Uncaught error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Mently] Unhandled promise rejection:', e.reason);
});

/** Pagina de fallback pentru erori fatale la boot. */
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
 * Mini-escape DOAR pentru pagina de eroare — nu folosim security.js (Pasul 4)
 * pentru a evita dependențe circulare în path-ul de fallback.
 */
function escapeForErrorView(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─────────────────────────── Utilities ─────────────────────────── */

function isDev() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '' /* file:// */;
}

/* ─────────────────────────── Run ─────────────────────────── */

// `type="module"` rulează deja deferred, dar verificăm pentru robustețe.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
