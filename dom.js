/**
 * dom.js — Utilități DOM și accesibilitate
 * =============================================================================
 * Conține exclusiv instrumente pentru:
 *   1. Aria-live (anunțuri screen reader)
 *   2. Focus management (firstFocusable, allFocusable)
 *
 * DE CE nu conține escapeHtml:
 *   escapeHtml a fost mutat în security.js la refactorizarea din Pasul 4.
 *   Toată sanitizarea trăiește într-un singur loc — auditorul scanează un
 *   singur fișier pentru a verifica că nu există path de injecție.
 *   dom.js nu știe nimic despre date — e pur utilitar de prezentare.
 * =============================================================================
 */

// Referința la elementul aria-live din index.html — setat o singură dată la boot.
// Nu facem querySelector() la fiecare announce() pentru a evita thrashing-ul DOM.
let ariaLiveEl = null;

/** Conectează elementul aria-live. Apelat din ui.js în faza de init(). */
export function setAriaLive(el) {
  ariaLiveEl = el;
}

/**
 * Anunță un mesaj text către cititoarele de ecran (NVDA, JAWS, VoiceOver).
 *
 * DE CE golim mai întâi și setăm cu 50ms delay:
 *   Browserele nu re-anunță conținut identic — dacă anunțăm de două ori același
 *   mesaj (ex: "Notița X a fost adăugată" × 2), al doilea e ignorat. Golind
 *   textContent și re-setând după un micro-delay forțăm o mutație nouă în DOM,
 *   pe care aria-live o percepe ca anunț nou. 50ms > un tick de render → sigur.
 */
export function announce(message) {
  if (!ariaLiveEl) return;
  ariaLiveEl.textContent = '';
  setTimeout(() => {
    ariaLiveEl.textContent = String(message);
  }, 50);
}

/**
 * Returnează primul element focusabil dintr-un container.
 * Folosit la deschiderea drawer-ului (focus → primul câmp de formular).
 *
 * Selectorul acoperă setul canonic WCAG de elemente tab-abile:
 *   input, button, textarea, select, a[href], orice cu tabindex ≥ 0.
 * [tabindex="-1"] e exclus intenționat — el poate primi focus programatic
 *   (ex: focus()) dar nu prin Tab al utilizatorului.
 * [contenteditable] lipsește — nu folosim elemente editabile nativ în UI.
 */
export function firstFocusable(container) {
  return container.querySelector(
    'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
}

/**
 * Returnează TOATE elementele focusabile în ordine DOM — pentru focus trap.
 * Folosit în ui-drawer.js: Tab/Shift+Tab ciclează în interiorul drawer-ului
 * fără a ieși în restul paginii (pattern ARIA pentru modale și drawer-e).
 *
 * Adaugă a[href] față de firstFocusable() — link-urile sunt rare în drawer
 * dar trebuie incluse ca să nu rompem trap-ul dacă apar în conținut viitor.
 */
export function allFocusable(container) {
  return [...container.querySelectorAll(
    'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )];
}