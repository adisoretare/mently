/**
 * dom.js — Utilități DOM și accesibilitate
 * =============================================================================
 * Modul partajat de toate componentele UI. Centralizează:
 *   - HTML escape (versiune minimală; Pasul 4 va aduce security.js cu sanitizare extinsă)
 *   - Anunțuri pentru screen-readers (aria-live)
 *   - Helpers comuni (focus management)
 *
 * DECIZIE: nu importăm nimic din alte module → fără dependențe circulare,
 *          fiecare componentă UI poate folosi dom.js liber.
 * =============================================================================
 */

let ariaLiveEl = null;

/** Înregistrează elementul aria-live (apelat o singură dată din ui.js). */
export function setAriaLive(el) {
  ariaLiveEl = el;
}

/**
 * Anunță un mesaj către cititoarele de ecran (NVDA, JAWS, VoiceOver).
 * Trucul cu setTimeout(0) forțează re-anunțarea chiar și pentru mesaje identice
 * consecutive (NVDA optimizează altfel și sare peste duplicate).
 */
export function announce(message) {
  if (!ariaLiveEl) return;
  ariaLiveEl.textContent = '';
  setTimeout(() => {
    ariaLiveEl.textContent = String(message);
  }, 50);
}

/**
 * HTML escape pentru a preveni injecție prin innerHTML.
 * NOTĂ: Aceasta e versiunea minimală pentru Pasul 2. Pasul 4 (security.js)
 *       va adăuga sanitizare extinsă (URL-uri, atribute, data-attributes etc.).
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Întoarce primul element focusabil dintr-un container.
 * Util pentru focus management în drawer.
 */
export function firstFocusable(container) {
  return container.querySelector(
    'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
}

/** Toate elementele focusabile, în ordine — folosit pentru focus trap. */
export function allFocusable(container) {
  return [...container.querySelectorAll(
    'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )];
}
