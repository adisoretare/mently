// Store.js trimite toată validarea la security.js — singura sursă de adevăr pentru date.

import {
  sanitizeTitle,
  sanitizeContent,
  sanitizeTags,
  sanitizeAttachments,
  validateNote,
  generateId,
  createRateLimiter,
  LIMITS,
  SecurityError,
} from './security.js';

const STORAGE_KEY = 'mently:v1:state';
const STORE_VERSION = 1;

// Setat pe false la prima eroare de localStorage → saveToStorage nu mai spam-uiește
let storageAvailable = true;
// Callback opțional injectat de main.js → anunță utilizatorul despre erori de storage
let storageErrorReporter = null;

/** Înregistrează un callback (fn: string → void) apelat la erori de storage. */
export function setStorageErrorReporter(fn) {
  storageErrorReporter = typeof fn === 'function' ? fn : null;
}

// Mesaje localizate injectate din main.js via setMessages().
// DE CE nu importăm i18n.js direct: store.js trebuie să rămână headless-testabil
// (fără DOM, fără import chains care trag UI). Același pattern ca setStorageErrorReporter.
let messages = null;

/**
 * Injectează mesajele localizate (t.errors din i18n.js) pentru SecurityError.
 * Apelat o singură dată din main.js după Store.init().
 */
export function setMessages(m) {
  messages = (m && typeof m === 'object') ? m : null;
}

/**
 * Rate limiter pentru addNote — 30 inserări/minut.
 * Aplicat la TOATE apelurile addNote (formular sau programatic via __mently.Store).
 * replaceNotes() bypass-uiește intenționat → import bulk e permis.
 */
const insertLimiter = createRateLimiter(30, 60_000);

const initialState = () => ({
  version: STORE_VERSION,
  notes: [],
  meta: {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastExportAt: null,
  },
});

let state = null;
const subscribers = new Set();

/* ─── Undo / Redo — snapshot stack ───
 * Alegere de design: snapshot complet (structuredClone) în locul command
 * pattern-ului. Starea e mică (≤1000 note ≈ sub 1MB), clonarea durează
 * microsecunde, iar snapshot-ul e imun la bug-uri de "inverse operation".
 * Snapshot-ul se face DOAR când mutația chiar are loc (după validări),
 * altfel un throw ar lăsa un snapshot orfan în stivă. */
const UNDO_CAP = 50;
let undoStack = [];
let redoStack = [];

function snapshot() {
  undoStack.push(structuredClone(state));
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  redoStack.length = 0; // o mutație nouă invalidează redo-urile
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function undo() {
  if (undoStack.length === 0) return false;
  redoStack.push(structuredClone(state));
  state = undoStack.pop();
  saveToStorage();
  notify();
  return true;
}

export function redo() {
  if (redoStack.length === 0) return false;
  undoStack.push(structuredClone(state));
  state = redoStack.pop();
  saveToStorage();
  notify();
  return true;
}

/**
 * Hidratare din localStorage. Tratează:
 *   - localStorage indisponibil (Safari private) → fallback in-memory
 *   - JSON corupt → state fresh
 *   - Note individuale corupte/manipulate (DevTools tampering) → filtrate
 *
 * SECURITATE: chiar și starea din PROPRIUL localStorage e tratată ca untrusted.
 * Un atacator cu acces fizic la calculator ar putea injecta JSON malițios via
 * DevTools. Validarea per-câmp previne ca acel JSON să corupă UI-ul.
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();

    // JSON malformat = date corupte, NU storage indisponibil. Îl tratăm aici
    // (reset + cleanup) ca să nu cădem în catch-ul exterior care ar dezactiva
    // complet persistența pentru restul sesiunii. Bug descoperit de teste.
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[store] JSON corupt în localStorage. Resetez.');
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return initialState();
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.notes)) {
      console.warn('[store] Stare coruptă în localStorage. Resetez.');
      // Șterge blob-ul corupt ca să nu re-eșueze la fiecare reload
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return initialState();
    }

    if (parsed.version !== STORE_VERSION) {
      console.info(`[store] Migrare schemă: ${parsed.version} → ${STORE_VERSION}`);
      // hook pentru migrări viitoare
    }

    // DEFENSE IN DEPTH: re-validăm fiecare notă chiar dacă vine din storage-ul nostru
    const validNotes = [];
    let dropped = 0;
    for (const raw of parsed.notes) {
      const valid = validateNote(raw);
      if (valid) {
        if (!valid.id) valid.id = generateId();
        validNotes.push(valid);
      } else {
        dropped++;
      }
    }
    if (dropped > 0) {
      console.warn(`[store] ${dropped} note corupte ignorate la încărcare.`);
    }

    return {
      version: STORE_VERSION,
      notes: validNotes,
      meta: { ...initialState().meta, ...(parsed.meta || {}) },
    };
  } catch (err) {
    // localStorage indisponibil (Safari Private, Firefox strict) — modul in-memory
    storageAvailable = false;
    console.info('[store] localStorage indisponibil — rulez in-memory:', err.message);
    return initialState();
  }
}

function saveToStorage() {
  if (!storageAvailable) return false;
  try {
    state.meta.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    const isQuota = err.name === 'QuotaExceededError' || err.code === 22;
    if (isQuota) {
      // Stocare plină — anunță utilizatorul, dar nu dezactivăm complet (poate elibera spațiu)
      console.warn('[store] localStorage plin (QuotaExceededError).');
      storageErrorReporter?.('quota');
    } else {
      storageAvailable = false;
      console.error('[store] Persistare eșuată:', err);
      storageErrorReporter?.('disabled');
    }
    return false;
  }
}

function notify() {
  for (const fn of subscribers) {
    try { fn(state); } catch (err) { console.error('[store] subscriber error:', err); }
  }
}

export function subscribe(fn) {
  if (typeof fn !== 'function') throw new TypeError('subscribe necesită o funcție');
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function init() {
  state = loadFromStorage();
  // Sesiune nouă = istoric nou; previne și cross-talk între teste
  undoStack = [];
  redoStack = [];
  return getState();
}

/** Copie defensivă a unei note — subscriber-ii nu pot muta starea canonică. */
function cloneNote(n) {
  return {
    ...n,
    tags: [...n.tags],
    attachments: Array.isArray(n.attachments) ? n.attachments.map((a) => ({ ...a })) : [],
  };
}

export function getState() {
  return { ...state, notes: state.notes.map(cloneNote) };
}

export function getNotes() {
  return state.notes.map(cloneNote);
}

export function getNoteById(id) {
  const found = state.notes.find((n) => n.id === id);
  return found ? cloneNote(found) : null;
}

/**
 * Adaugă o notiță nouă.
 * Sanitizarea e delegată complet către security.js → date curate ÎN store.
 */
export function addNote({ title, content, tags, attachments, collapsed = false, isTask = false, done = false, isSun = false } = {}) {
  // Rate limit — protejează împotriva spam-ului (form sau script automat).
  // Verificat ÎNAINTE de orice procesare → economie CPU pe rafale de spam.
  if (!insertLimiter.tryAcquire()) {
    // Mesajul vine din i18n via injecție — store.js nu importă i18n direct.
    throw new SecurityError(
      messages?.rateLimited ?? 'Rate limited.',
      'RATE_LIMITED'
    );
  }
  // Cap pe numărul total — DoS prevention (n² în physics.js devine impractical >1k)
  if (state.notes.length >= LIMITS.NOTES_MAX_COUNT) {
    throw new SecurityError(
      messages?.notesCapReached(LIMITS.NOTES_MAX_COUNT) ?? `Max ${LIMITS.NOTES_MAX_COUNT} notes.`,
      'NOTES_CAP_REACHED'
    );
  }

  const cleanTitle = sanitizeTitle(title);
  if (!cleanTitle) throw new SecurityError('Titlul este obligatoriu.', 'TITLE_REQUIRED');

  snapshot();

  const note = {
    id: generateId(),
    title: cleanTitle,
    content: sanitizeContent(content),
    tags: sanitizeTags(tags),
    attachments: sanitizeAttachments(attachments),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    collapsed: Boolean(collapsed),
    isTask:    Boolean(isTask),
    done:      Boolean(done),
    isSun:     Boolean(isSun),
  };

  state.notes.push(note);
  saveToStorage();
  notify();
  return cloneNote(note);
}

export function updateNote(id, patch = {}) {
  const idx = state.notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;

  const next = { ...state.notes[idx] };
  if ('title' in patch) {
    const cleaned = sanitizeTitle(patch.title);
    if (!cleaned) throw new SecurityError('Titlul este obligatoriu.', 'TITLE_REQUIRED');
    next.title = cleaned;
  }
  if ('content' in patch)   next.content   = sanitizeContent(patch.content);
  if ('tags' in patch)      next.tags      = sanitizeTags(patch.tags);
  if ('attachments' in patch) next.attachments = sanitizeAttachments(patch.attachments);
  if ('collapsed' in patch) next.collapsed = Boolean(patch.collapsed);
  if ('isTask' in patch)    next.isTask    = Boolean(patch.isTask);
  if ('done' in patch)      next.done      = Boolean(patch.done);
  if ('isSun' in patch)    next.isSun     = Boolean(patch.isSun);
  next.updatedAt = Date.now();

  snapshot();
  state.notes[idx] = next;
  saveToStorage();
  notify();
  return cloneNote(next);
}

export function deleteNote(id) {
  if (!state.notes.some((n) => n.id === id)) return false;
  snapshot();
  state.notes = state.notes.filter((n) => n.id !== id);
  saveToStorage();
  notify();
  return true;
}

export function clearAll() {
  if (state.notes.length > 0) snapshot(); // clearAll pe stare goală nu merită un pas de undo
  state = initialState();
  saveToStorage();
  notify();
}

/**
 * Înlocuiește starea cu un set de note pre-validate (Pasul 5 — Import).
 * Caller-ul (ui sau test) trebuie să fi rulat deja `parseAndValidateImport`
 * din security.js. Aici doar adoptăm rezultatul.
 */
export function replaceNotes(validatedNotes) {
  if (!Array.isArray(validatedNotes)) {
    throw new TypeError('replaceNotes așteaptă un array de note validate.');
  }
  snapshot(); // un import greșit trebuie să fie reversibil
  state = {
    version: STORE_VERSION,
    notes: validatedNotes.map(cloneNote),
    meta: {
      createdAt: state?.meta?.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastExportAt: state?.meta?.lastExportAt || null,
    },
  };
  saveToStorage();
  notify();
  return getState();
}

/** Serializare pentru export (Pasul 5). */
export function exportJSON() {
  state.meta.lastExportAt = Date.now();
  saveToStorage();
  return JSON.stringify(state, null, 2);
}