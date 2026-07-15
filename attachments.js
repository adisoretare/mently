// Stocare fișiere atașate (PDF/text/imagini) în IndexedDB.
//
// DE CE IndexedDB și nu localStorage: localStorage are cotă totală ~5MB și
// stochează doar string-uri (base64 ar umfla fișierele cu +33%). IndexedDB
// stochează Blob-uri binare native, cu cote de ordinul sutelor de MB.
// Arhitectură pe două niveluri: metadata (mică) în starea din localStorage,
// conținutul binar (mare) aici — fiecare strat în stocarea potrivită.
//
// INTERACȚIUNEA CU UNDO/REDO: blob-urile NU sunt șterse imediat când o notă
// e ștearsă — snapshot-urile de undo păstrează doar metadata, iar un undo
// trebuie să regăsească fișierul intact. Curățenia se face la boot (gcOrphans),
// când istoricul de undo e oricum resetat.

const DB_NAME = 'mently:files';
const DB_VERSION = 1;
const STORE = 'attachments';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE); // key = attachment id (string)
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null; // permite retry la următorul apel
      reject(req.error);
    };
  });
  return dbPromise;
}

/** Rulează o tranzacție și împachetează request-ul într-un Promise. */
async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Salvează un Blob sub id-ul atașamentului. */
export function put(id, blob) {
  return tx('readwrite', (s) => s.put(blob, id));
}

/** Returnează Blob-ul sau undefined dacă nu există. */
export function get(id) {
  return tx('readonly', (s) => s.get(id));
}

/** Șterge un blob (folosit doar de GC — vezi nota din header). */
export function remove(id) {
  return tx('readwrite', (s) => s.delete(id));
}

/** Toate id-urile stocate. */
export function listIds() {
  return tx('readonly', (s) => s.getAllKeys());
}

/**
 * Garbage-collect: șterge blob-urile care nu mai sunt referențiate de nicio
 * notă. Apelat la boot din main.js, DUPĂ Store.init().
 * @param {Set<string>} referencedIds — id-urile atașamentelor din toate notele
 * @returns {number} câte blob-uri au fost curățate
 */
export async function gcOrphans(referencedIds) {
  try {
    const ids = await listIds();
    let removed = 0;
    for (const id of ids) {
      if (!referencedIds.has(id)) {
        await remove(id);
        removed++;
      }
    }
    return removed;
  } catch (err) {
    // IndexedDB indisponibil (private mode vechi) — atașamentele degradează
    // grațios: metadata rămâne, fișierele lipsesc, aplicația nu crapă.
    console.warn('[attachments] GC eșuat:', err);
    return 0;
  }
}

/* ─── Base64 pentru export/import JSON ───
 * Export-ul e un singur fișier JSON portabil → blob-urile intră base64.
 * Conversia se face pe chunk-uri ca să nu depășim limita de argumente
 * a lui String.fromCharCode pe fișiere mari. */

export async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBlob(b64, type) {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return new Blob([buf], { type });
}
