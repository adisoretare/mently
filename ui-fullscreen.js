import { announce } from './dom.js';
import { t } from './i18n.js';

let btn = null;

export function init() {
  btn = document.getElementById('fullscreen-toggle');
  if (!btn) return;

  // Sync label from i18n (overrides static HTML default which is always RO)
  btn.setAttribute('aria-label', t.fullscreen.enter);

  btn.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', sync);
}

function toggle() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

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
