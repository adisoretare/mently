/**
 * ui-drawer.js — Comportament drawer (mobile sidebar)
 * =============================================================================
 * DECIZII ARHITECTURALE (Cap. III — Interacțiune, accesibilitate):
 *
 * 1. PROGRESSIVE ENHANCEMENT
 *    Desktop ≥ 768px: sidebar e mereu vizibil, drawer.js practic stă inactiv.
 *    Mobile < 768px: sidebar e off-screen → hamburger / backdrop îl deschid.
 *    Aceeași HTML, aceeași logică — doar CSS-ul (media queries) schimbă layout-ul.
 *
 * 2. FOCUS MANAGEMENT (WCAG 2.4.3)
 *    - La deschidere: focus → primul element focusabil din sidebar (input titlu)
 *    - Focus trap: Tab/Shift+Tab nu părăsesc drawer-ul
 *    - La închidere: focus revine la elementul care a deschis drawer-ul
 *
 * 3. ESCAPE TO CLOSE
 *    Standard pentru modale/drawer. Listener global pe document, condiționat de
 *    starea isOpen → zero overhead când e închis.
 *
 * 4. BACKDROP CLICK
 *    Click pe overlay închide drawer-ul → pattern intuitiv preluat din iOS/Android.
 *
 * 5. ARIA STATE SYNC
 *    aria-expanded pe buton și aria-hidden pe drawer reflectă starea curentă →
 *    screen-readers anunță "expanded"/"collapsed" automat.
 * =============================================================================
 */

import { t } from './i18n.js';
import { announce, allFocusable, firstFocusable } from './dom.js';

const MOBILE_BREAKPOINT = 768; // sincron cu Tailwind `md:` breakpoint

let sidebarEl = null;
let openBtn = null;
let closeBtn = null;
let backdropEl = null;
let isOpen = false;
let previouslyFocused = null;

/* ─────────────────────────── Init ─────────────────────────── */

export function init() {
  sidebarEl  = document.getElementById('sidebar');
  openBtn    = document.getElementById('drawer-open');
  closeBtn   = document.getElementById('drawer-close');
  backdropEl = document.getElementById('drawer-backdrop');

  if (!sidebarEl) return;

  // Pe mobil drawer-ul pornește închis; pe desktop e mereu "deschis logic".
  syncToBreakpoint();

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdropEl?.addEventListener('click', close);

  document.addEventListener('keydown', handleGlobalKeydown);
  sidebarEl.addEventListener('keydown', handleSidebarKeydown);
  window.addEventListener('resize', syncToBreakpoint, { passive: true });
}

/* ─────────────────────────── Open / Close ─────────────────────────── */

export function open() {
  if (isOpen || isDesktop()) return;
  isOpen = true;
  previouslyFocused = document.activeElement;

  sidebarEl.classList.add('is-open');
  backdropEl?.classList.add('is-visible');
  sidebarEl.setAttribute('aria-hidden', 'false');
  openBtn?.setAttribute('aria-expanded', 'true');
  openBtn?.classList.add('hidden'); // ascunde hamburger când drawer e deschis (fără buton fantomă)
  document.body.style.overflow = 'hidden'; // previne scroll background pe mobil

  announce(t.a11y.drawerOpened);

  // Focus primul element focusabil DUPĂ tranziție (300ms)
  setTimeout(() => {
    const first = firstFocusable(sidebarEl);
    first?.focus();
  }, 320);
}

export function close() {
  if (!isOpen) return;
  isOpen = false;

  sidebarEl.classList.remove('is-open');
  backdropEl?.classList.remove('is-visible');
  sidebarEl.setAttribute('aria-hidden', 'true');
  openBtn?.setAttribute('aria-expanded', 'false');
  openBtn?.classList.remove('hidden'); // restaurează hamburger
  document.body.style.overflow = '';

  announce(t.a11y.drawerClosed);

  // Restituim focus-ul (esențial pentru utilizatori cu screen reader/tastatură)
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  }
}

/* ─────────────────────────── Keyboard ─────────────────────────── */

function handleGlobalKeydown(e) {
  if (e.key === 'Escape' && isOpen) {
    close();
  }
}

/**
 * Focus trap: când drawer e deschis, Tab/Shift+Tab nu îl pot părăsi.
 * (Doar pe mobil — pe desktop sidebar-ul nu e modal.)
 */
function handleSidebarKeydown(e) {
  if (!isOpen || e.key !== 'Tab') return;
  const focusables = allFocusable(sidebarEl);
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

/* ─────────────────────────── Responsiveness ─────────────────────────── */

function isDesktop() {
  return window.innerWidth >= MOBILE_BREAKPOINT;
}

/**
 * La schimbarea breakpoint-ului (rotire device, resize), curățăm starea drawer
 * ca să nu rămână ARIA contradictoriu (ex: desktop cu aria-hidden=true).
 */
function syncToBreakpoint() {
  if (isDesktop()) {
    // Desktop: sidebar e mereu vizibil, "logica" de drawer e off
    sidebarEl.classList.remove('is-open');
    backdropEl?.classList.remove('is-visible');
    sidebarEl.removeAttribute('aria-hidden');
    openBtn?.classList.remove('hidden'); // md:hidden preia oricum pe desktop
    document.body.style.overflow = '';
    isOpen = false;
  } else {
    // Mobile: dacă nu e deschis explicit, marchează ca ascuns
    if (!isOpen) {
      sidebarEl.setAttribute('aria-hidden', 'true');
      openBtn?.classList.remove('hidden'); // asigură hamburger vizibil
    }
  }
}