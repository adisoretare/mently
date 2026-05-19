/**
 * store.js — Data Access Layer (Strat de persistență)
 * =============================================================================
 * DECIZII ARHITECTURALE (Cap. I — Inginerie web):
 *
 * 1. SINGLE SOURCE OF TRUTH
 *    Store-ul deține întreaga stare a aplicației. ui.js și graph.js sunt consumeri
 *    PURI — citesc starea, nu o mută direct. Mutațiile trec exclusiv prin API-ul public
 *    (addNote, updateNote, deleteNote, replaceState). Beneficiu: data flow unidirecțional,
 *    debugging trivial, testabilitate (poți injecta un mock pentru localStorage).
 *
 * 2. OBSERVER PATTERN
 *    Componentele se abonează la schimbări via subscribe(callback). Evităm cuplarea
 *    strânsă store ↔ UI și permitem multiple consumeri (de ex. analytics, undo-stack).
 *
 * 3. SCHEMA VERSIONING
 *    STORE_VERSION + cale de migrare → permite evoluția schemei fără pierderi de date.
 *
 * 4. DEFENSIVE COPYING
 *    getState/getNotes returnează copii → caller-ul nu poate corupe starea internă.
 *
 * 5. EDGES NU SE STOCHEAZĂ
 *    Sunt derivate din tag-uri comune (vezi graph.js). O singură sursă de adevăr;
 *    imposibil să existe inconsistență noduri ↔ muchii.
 *
 * 6. FAIL-SOFT
 *    localStorage indisponibil (Safari private, quota plină) NU prăbușește aplicația;
 *    folosim un fallback in-memory + log warning.
 * =============================================================================
 */

const STORAGE_KEY = 'mently:v1:state';
const STORE_VERSION = 1;

/**
 * @typedef {Object} Note
 * @property {string}   id        - UUID v4
 * @property {string}   title     - Titlu, max 200 caractere (sanitizat în Pasul 4)
 * @property {string}   content   - Descriere, max 10.000 caractere
 * @property {string[]} tags      - Lowercase, fără duplicate, fără string-uri goale
 * @property {number}   createdAt - Epoch ms
 * @property {number}   updatedAt - Epoch ms
 */

/** Stare inițială — factory function (evităm referință partajată între reseturi). */
const initialState = () => ({
  version: STORE_VERSION,
  notes: [],
  meta: {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastExportAt: null,
  },
});

/** Singleton in-memory; null până la init(). */
let state = null;
/** Set garantează unicitate; iterare cu insertion order. */
const subscribers = new Set();

/* ─────────────────────────── Utilities ─────────────────────────── */

/**
 * UUID v4 — preferăm crypto.randomUUID (RFC 4122, criptografic secure).
 * Fallback pentru browsere mai vechi care nu îl expun încă.
 */
function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normalizează tag-uri: trim, lowercase, fără goluri, fără duplicate.
 * Critic pentru matching corect în graph.js (case-insensitive).
 */
function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(
    tags
      .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
      .filter(Boolean)
  )];
}

/* ─────────────────────────── Persistence ─────────────────────────── */

/**
 * Hidratare din localStorage. Tratează:
 *   - localStorage inaccesibil → returnează state nou (fail-soft).
 *   - JSON corupt → reinițializare cu warning.
 *   - schemă veche → punct de migrare (pregătit, gol acum).
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.notes)) {
      console.warn('[store] Stare coruptă în localStorage. Resetez.');
      return initialState();
    }

    if (parsed.version !== STORE_VERSION) {
      console.info(`[store] Migrare schemă: ${parsed.version} → ${STORE_VERSION}`);
      // Hook pentru migrări viitoare (ex: v1 → v2 ar adăuga câmp X).
    }

    return { ...initialState(), ...parsed };
  } catch (err) {
    console.error('[store] localStorage indisponibil — rulez in-memory:', err);
    return initialState();
  }
}

/**
 * Persistare. Eșuează silent la quota exceeded — UI poate fi notificat ulterior.
 * @returns {boolean} success
 */
function saveToStorage() {
  try {
    state.meta.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('[store] Persistare eșuată (probabil quota):', err);
    return false;
  }
}

/* ─────────────────────────── Pub/Sub ─────────────────────────── */

function notify() {
  for (const fn of subscribers) {
    try {
      fn(state);
    } catch (err) {
      // Un subscriber nu trebuie să blocheze ceilalți → izolat în try/catch.
      console.error('[store] subscriber a aruncat eroare:', err);
    }
  }
}

/**
 * Subscribe la modificări. Returnează funcția de unsubscribe (clasic).
 * @param {(state: object) => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  if (typeof fn !== 'function') throw new TypeError('subscribe necesită o funcție');
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/* ─────────────────────────── Public API ─────────────────────────── */

/** Bootstrap. Apelat o singură dată din main.js. */
export function init() {
  state = loadFromStorage();
  return getState();
}

/** Copie defensivă a întregii stări. */
export function getState() {
  return { ...state, notes: state.notes.map((n) => ({ ...n, tags: [...n.tags] })) };
}

/** Lista notițelor (copie). */
export function getNotes() {
  return state.notes.map((n) => ({ ...n, tags: [...n.tags] }));
}

/** Caută o notiță după id. Returnează null dacă nu există. */
export function getNoteById(id) {
  const found = state.notes.find((n) => n.id === id);
  return found ? { ...found, tags: [...found.tags] } : null;
}

/**
 * Adaugă o notiță nouă.
 * IMPORTANT: input-urile string TREBUIE deja sanitizate de security.js (Pasul 4).
 * Aici doar normalizăm și validăm structural.
 */
export function addNote({ title, content, tags } = {}) {
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle) throw new Error('Titlul este obligatoriu.');

  const note = {
    id: uuid(),
    title: cleanTitle.slice(0, 200),
    content: String(content ?? '').trim().slice(0, 10000),
    tags: normalizeTags(tags),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  state.notes.push(note);
  saveToStorage();
  notify();
  return { ...note, tags: [...note.tags] };
}

/** PATCH semantics: actualizează doar câmpurile prezente în `patch`. */
export function updateNote(id, patch = {}) {
  const idx = state.notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;

  const next = { ...state.notes[idx] };
  if ('title' in patch)   next.title   = String(patch.title ?? '').trim().slice(0, 200);
  if ('content' in patch) next.content = String(patch.content ?? '').trim().slice(0, 10000);
  if ('tags' in patch)    next.tags    = normalizeTags(patch.tags);
  next.updatedAt = Date.now();

  state.notes[idx] = next;
  saveToStorage();
  notify();
  return { ...next, tags: [...next.tags] };
}

/** Șterge o notiță; returnează true dacă a existat. */
export function deleteNote(id) {
  const before = state.notes.length;
  state.notes = state.notes.filter((n) => n.id !== id);
  if (state.notes.length === before) return false;
  saveToStorage();
  notify();
  return true;
}

/** Reset complet — folosit la "Import" (Pasul 5) și pentru testare. */
export function clearAll() {
  state = initialState();
  saveToStorage();
  notify();
}

/**
 * Înlocuiește starea cu un payload extern (Pasul 5 — Import).
 * Validează STRICT structura → protejează împotriva JSON-urilor malițioase/malformate.
 */
export function replaceState(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload invalid: așteptam obiect.');
  }
  if (!Array.isArray(payload.notes)) {
    throw new Error('Câmpul `notes` lipsește sau nu este array.');
  }

  const sanitized = {
    version: STORE_VERSION,
    notes: payload.notes
      .filter((n) => n && typeof n === 'object' && typeof n.title === 'string')
      .map((n) => ({
        id:        typeof n.id === 'string' && n.id ? n.id : uuid(),
        title:     String(n.title).trim().slice(0, 200),
        content:   String(n.content ?? '').trim().slice(0, 10000),
        tags:      normalizeTags(n.tags),
        createdAt: Number.isFinite(n.createdAt) ? n.createdAt : Date.now(),
        updatedAt: Number.isFinite(n.updatedAt) ? n.updatedAt : Date.now(),
      })),
    meta: { ...initialState().meta, ...(payload.meta || {}) },
  };

  state = sanitized;
  saveToStorage();
  notify();
  return getState();
}

/** Serializare pentru export (Pasul 5). Indentat = lizibil pentru utilizator. */
export function exportJSON() {
  state.meta.lastExportAt = Date.now();
  saveToStorage();
  return JSON.stringify(state, null, 2);
}
