// URL hash deep linking: #node=<id> or #tag=<tagname>
// Encodes current view state into the URL bar; restores on page load.

import * as Canvas from './canvas.js';

export function init() {
  // Restore state from URL hash on load
  applyHash(location.hash);

  // React to browser back/forward navigation
  window.addEventListener('hashchange', () => applyHash(location.hash));
}

export function setNodeHash(id) {
  if (id) {
    history.replaceState(null, '', `#node=${encodeURIComponent(id)}`);
  } else {
    clearHash();
  }
}

export function setTagHash(tag) {
  if (tag) {
    history.replaceState(null, '', `#tag=${encodeURIComponent(tag)}`);
  } else {
    clearHash();
  }
}

export function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

function applyHash(hash) {
  if (!hash || hash === '#') return;

  const nodeMatch = hash.match(/^#node=(.+)$/);
  if (nodeMatch) {
    const id = decodeURIComponent(nodeMatch[1]);
    // Delay one frame so Canvas is fully initialized first
    requestAnimationFrame(() => Canvas.setSelected(id));
    return;
  }

  const tagMatch = hash.match(/^#tag=(.+)$/);
  if (tagMatch) {
    const tag = decodeURIComponent(tagMatch[1]);
    requestAnimationFrame(() => Canvas.highlightByTag(tag));
  }
}
