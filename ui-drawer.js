// ui-drawer.js — Drawer mobil: sidebar off-screen deschis/închis cu hamburger.
// Pe ecrane mici sidebar-ul devine un „sertar” care alunecă peste conținut,
// cu backdrop, focus trap și anunțuri pentru cititoarele de ecran.
// Inactiv pe desktop ≥768px, unde sidebar-ul e mereu vizibil.

import { t } from './i18n.js';
import { announce, allFocusable, firstFocusable } from './dom.js';

const MOBILE_BREAKPOINT = 768; // sincron cu Tailwind `md:` breakpoint

let sidebarEl = null;
let openBtn = null;
let closeBtn = null;
let backdropEl = null;
let isOpen = false;
let previouslyFocused = null;

/**
 * Leagă elementele din DOM (sidebar, butoane, backdrop) și instalează
 * ascultătorii de click, tastatură și resize.
 */
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

  // rAF coalescing — evităm sute de apeluri pe resize drag (identic cu canvas.js)
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(syncToBreakpoint);
  }, { passive: true });
}

/** Deschide drawer-ul (doar pe mobil) și mută focus-ul în interior. */
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

  // Focus primul element focusabil după tranziție (0ms sub reduced-motion, 320ms altfel)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    const first = firstFocusable(sidebarEl);
    first?.focus();
  }, reduced ? 0 : 320);
}

/** Închide drawer-ul și restituie focus-ul elementului care l-a deschis. */
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

function isDesktop() {
  return window.innerWidth >= MOBILE_BREAKPOINT;
}

/**
 * La schimbarea breakpoint-ului (rotire device, resize), curățăm starea drawer
 * ca să nu rămână ARIA contradictoriu (ex: desktop cu aria-hidden=true).
 */
function syncToBreakpoint() {
  if (isDesktop()) {
    // Desktop: sidebar e mereu vizibil, "logica" de drawer e off.
    // Dacă drawer-ul era deschis (ex: rotire device → desktop), restituim focus-ul.
    if (isOpen && previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    sidebarEl.classList.remove('is-open');
    backdropEl?.classList.remove('is-visible');
    sidebarEl.removeAttribute('aria-hidden');
    openBtn?.classList.remove('hidden'); // md:hidden preia oricum pe desktop
    document.body.style.overflow = '';
    isOpen = false;
    previouslyFocused = null;
  } else {
    // Mobile: dacă nu e deschis explicit, marchează ca ascuns
    if (!isOpen) {
      sidebarEl.setAttribute('aria-hidden', 'true');
      openBtn?.classList.remove('hidden'); // asigură hamburger vizibil
    }
  }
}