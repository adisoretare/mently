// URL hash deep linking: #node=<id> or #tag=<tagname>
// Encodes current view state into the URL bar; restores on page load.
//
// SECURITATE: hash-ul e singurul input extern pe care un atacator îl poate
// controla printr-un link partajat. Tot ce vine de aici trece prin aceleași
// validări din security.js ca orice alt input (isValidId / sanitizeTag) —
// un hash malformat sau ostil e pur și simplu ignorat, fără crash.

import * as Canvas from './canvas.js';
import { isValidId, sanitizeTag } from './security.js';

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

/** decodeURIComponent aruncă URIError pe secvențe % malformate (ex: "#node=%"). */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function applyHash(hash) {
  if (!hash || hash === '#') return;

  const nodeMatch = hash.match(/^#node=(.+)$/);
  if (nodeMatch) {
    const id = safeDecode(nodeMatch[1]);
    if (!isValidId(id)) return;
    // Delay one frame so Canvas is fully initialized first
    requestAnimationFrame(() => Canvas.setSelected(id));
    return;
  }

  const tagMatch = hash.match(/^#tag=(.+)$/);
  if (tagMatch) {
    const decoded = safeDecode(tagMatch[1]);
    if (decoded == null) return;
    const tag = sanitizeTag(decoded);
    if (!tag) return;
    requestAnimationFrame(() => Canvas.highlightByTag(tag));
  }
}
