// url-hash.js — Deep linking prin hash-ul din URL: #node=<id> sau #tag=<nume>.
// Hash-ul (partea de după #) funcționează ca o „adresă” a stării curente:
// codificăm în el ce e selectat, iar la încărcarea paginii îl citim înapoi.
// Astfel un link copiat/partajat deschide aplicația exact pe acel nod sau tag.
//
// SECURITATE: hash-ul e singurul input extern pe care un atacator îl poate
// controla printr-un link partajat. Tot ce vine de aici trece prin aceleași
// validări din security.js ca orice alt input (isValidId / sanitizeTag) —
// un hash malformat sau ostil e pur și simplu ignorat, fără crash.

import * as Canvas from './canvas.js';
import { isValidId, sanitizeTag } from './security.js';

/** Restaurează starea din hash la încărcare și ascultă navigarea înainte/înapoi. */
export function init() {
  // Restaurăm starea din hash-ul URL-ului la încărcarea paginii
  applyHash(location.hash);

  // Reacționăm la butoanele Back/Forward ale browserului (ele schimbă hash-ul)
  window.addEventListener('hashchange', () => applyHash(location.hash));
}

/**
 * Scrie nodul selectat în hash (sau curăță hash-ul dacă id e null).
 * Folosim history.replaceState ca să NU adăugăm câte o intrare în istoric
 * la fiecare selecție — altfel Back ar deveni inutilizabil.
 * @param {string|null} id — id-ul nodului selectat.
 */
export function setNodeHash(id) {
  if (id) {
    history.replaceState(null, '', `#node=${encodeURIComponent(id)}`);
  } else {
    clearHash();
  }
}

/**
 * Scrie tag-ul evidențiat în hash (sau curăță hash-ul dacă tag e gol).
 * @param {string|null} tag — numele tag-ului evidențiat.
 */
export function setTagHash(tag) {
  if (tag) {
    history.replaceState(null, '', `#tag=${encodeURIComponent(tag)}`);
  } else {
    clearHash();
  }
}

/** Golește hash-ul din URL, păstrând calea și query string-ul intacte. */
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
    // Amânăm cu un frame (requestAnimationFrame) ca să fim siguri
    // că modulul Canvas și-a terminat complet inițializarea
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
