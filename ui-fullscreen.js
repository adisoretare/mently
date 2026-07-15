/**
 * ui-fullscreen.js — Butonul de ecran complet (fullscreen).
 * Înveliș subțire peste Fullscreen API din browser: comută modul fullscreen
 * și ține în sincron aria-label-ul, iconițele și anunțurile pentru
 * cititoarele de ecran cu starea reală a documentului.
 */

import { announce } from './dom.js';
import { t } from './i18n.js';

let btn = null;

/** Leagă butonul #fullscreen-toggle de Fullscreen API și de evenimentul de sincronizare. */
export function init() {
  btn = document.getElementById('fullscreen-toggle');
  if (!btn) return;

  // Sincronizăm eticheta din i18n (suprascrie fallback-ul static din HTML, care e mereu în română)
  btn.setAttribute('aria-label', t.fullscreen.enter);

  btn.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', sync);
}

// .catch(() => {}) — browserul poate refuza cererea (ex: fără gest de utilizator);
// nu vrem un „Uncaught (in promise)” în consolă pentru un refuz normal
function toggle() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

// Ascultăm 'fullscreenchange' în loc să ghicim starea după click:
// utilizatorul poate ieși din fullscreen și cu Esc, iar butonul trebuie să afle
function sync() {
  if (!btn) return;
  const active = !!document.fullscreenElement;

  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.setAttribute('aria-label', active ? t.fullscreen.exit : t.fullscreen.enter);

  const iconEnter = btn.querySelector('[data-icon="enter"]');
  const iconExit  = btn.querySelector('[data-icon="exit"]');
  if (iconEnter) iconEnter.style.display = active ? 'none' : '';
  if (iconExit)  iconExit.style.display  = active ? ''     : 'none';

  announce(active ? t.a11y.fullscreenEntered : t.a11y.fullscreenExited);
}
