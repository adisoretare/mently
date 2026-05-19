/**
 * dom.js — Utilități DOM și accesibilitate
 * =============================================================================
 * REFACTOR (Pasul 4): escapeHtml a fost MUTAT în security.js — toată sanitizarea
 * trăiește acolo. dom.js păstrează doar utilitățile de accesibilitate și
 * focus management.
 * =============================================================================
 */

let ariaLiveEl = null;

export function setAriaLive(el) {
  ariaLiveEl = el;
}

/**
 * Anunță un mesaj către cititoarele de ecran (NVDA, JAWS, VoiceOver).
 * setTimeout(0) forțează re-anunțarea chiar și pentru mesaje identice consecutive.
 */
export function announce(message) {
  if (!ariaLiveEl) return;
  ariaLiveEl.textContent = '';
  setTimeout(() => {
    ariaLiveEl.textContent = String(message);
  }, 50);
}

/** Primul element focusabil dintr-un container — pentru focus management. */
export function firstFocusable(container) {
  return container.querySelector(
    'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
}

/** Toate elementele focusabile, în ordine — pentru focus trap. */
export function allFocusable(container) {
  return [...container.querySelectorAll(
    'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )];
}