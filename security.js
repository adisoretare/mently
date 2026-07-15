// Sanitizare XSS, validare import JSON, rate limiting. Singura sursă de validare în aplicație.

export const LIMITS = Object.freeze({
  TITLE_MAX_LENGTH: 200,
  CONTENT_MAX_LENGTH: 10_000,
  TAG_MAX_LENGTH: 32,
  TAGS_MAX_COUNT: 10,
  NOTES_MAX_COUNT: 1_000,
  JSON_IMPORT_MAX_BYTES: 5 * 1024 * 1024,   // 5 MB → previne DoS prin fișiere uriașe
  ID_MAX_LENGTH: 64,
  /** Inferioara fereastrei valide pt timestamp (~ ianuarie 1980). */
  EPOCH_MIN: 315_532_800_000,
  /** Superioara fereastrei valide (~ ianuarie 2100). */
  EPOCH_MAX: 4_102_444_800_000,
});

/**
 * Regex tag: caractere latine (inclusiv diacritice), cifre, cratimă, underscore.
 * Prima poziție: doar literă/cifră (nu cratimă/underscore în față).
 * Anchor-uri ^ $ obligatorii → match strict, nu partial.
 */
// \u0219 (\u0219) \u0219i \u021b (\u021b) ad\u0103ugate explicit: formele rom\u00e2ne\u0219ti corecte
// "comma below" sunt \u00een Latin Extended-B, \u00ceN AFARA intervalului \u00e0-\u017f
// (care acoper\u0103 doar formele legacy "cedilla" \u015f/\u0163).
// Bug descoperit de testele unitare: "\u00eenv\u0103\u021bare" era respins ca tag.
export const TAG_REGEX = /^[a-z0-9\u00e0-\u017f\u0219\u021b][a-z0-9\u00e0-\u017f\u0219\u021b_-]{0,31}$/;

/** Eroare custom pentru cazuri de securitate — separabilă în catch. */
export class SecurityError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'SecurityError';
    if (code) this.code = code;
  }
}

/**
 * Mapă entități HTML. Include `/` și `` ` `` (sub utilizate dar relevante):
 *   - `/` apare în `</script>` → escape-uirea lui previne închiderea prematură
 *     a unui tag <script> dacă cumva conținutul ajunge accidental într-un astfel
 *     de context.
 *   - `` ` `` poate fi folosit ca delimitator de atribute în IE11 buggy.
 * Cost negligibil, defense-in-depth garantat.
 */
const HTML_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
});

const HTML_ESCAPE_RE = /[&<>"'`/=]/g;

/**
 * Encode caractere HTML pentru prevenirea XSS.
 * IMPORTANT: pentru atribute, folosește același escape (suficient pentru
 * atribute delimitate cu " sau '). Pentru atribute fără delimitatori sau
 * pentru URL-uri în href/src, ar trebui escape suplimentar (nu inserăm așa
 * ceva user-generated în aplicația noastră).
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(HTML_ESCAPE_RE, (c) => HTML_ENTITIES[c]);
}

/**
 * Control characters care NU sunt acceptate în text utilizator:
 *   - \x00-\x08: NULL, etc. — pot rupe parsing, log injection
 *   - \x0B (VT), \x0C (FF): rar legitime
 *   - \x0E-\x1F: SO, SI, control codes
 *   - \x7F: DEL
 *   - \u200B-\u200D: zero-width chars (homograph attacks, spam)
 *   - \u202A-\u202E: RTL/LTR override (text spoofing — Unicode Trojan)
 *   - \u2066-\u2069: alte directional overrides
 *   - \uFEFF: BOM/zero-width no-break space
 *
 * Păstrăm: \t (\x09), \n (\x0A), \r (\x0D) — sunt utile în content.
 */
const FORBIDDEN_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Sanitizează text generic:
 *   1. Forțează la string (anti type-confusion)
 *   2. Elimină control characters & directional overrides
 *   3. Trim spații
 *   4. Trunchează la maxLength
 */
export function sanitizeText(value, maxLength) {
  if (value == null) return '';
  const str = String(value).replace(FORBIDDEN_CHARS_RE, '').trim();
  if (typeof maxLength === 'number' && str.length > maxLength) {
    return str.slice(0, maxLength);
  }
  return str;
}

export function sanitizeTitle(value) {
  return sanitizeText(value, LIMITS.TITLE_MAX_LENGTH);
}

export function sanitizeContent(value) {
  return sanitizeText(value, LIMITS.CONTENT_MAX_LENGTH);
}

/** Validează un tag deja normalizat (lowercase, trimmed). */
export function isValidTag(value) {
  return typeof value === 'string' && TAG_REGEX.test(value);
}

/**
 * Normalizează un tag: trim, lowercase, length cap, validare regex.
 * Returnează null dacă nu poate fi salvat.
 */
export function sanitizeTag(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(FORBIDDEN_CHARS_RE, '')
    .trim()
    .toLowerCase()
    .slice(0, LIMITS.TAG_MAX_LENGTH);
  return isValidTag(cleaned) ? cleaned : null;
}

/**
 * Sanitizează un array de tag-uri:
 *   - filtrează cele invalide
 *   - elimină duplicatele
 *   - cap la TAGS_MAX_COUNT
 */
export function sanitizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (out.length >= LIMITS.TAGS_MAX_COUNT) break;
    const tag = sanitizeTag(raw);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

/** Verifică dacă un timestamp e într-o fereastră rezonabilă (1980-2100). */
function isValidEpoch(n) {
  return Number.isFinite(n) && n >= LIMITS.EPOCH_MIN && n <= LIMITS.EPOCH_MAX;
}

/**
 * Verifică dacă un id e plauzibil (UUID-like sau string scurt cu caractere safe).
 * Exportat: folosit și de url-hash.js pentru validarea input-ului din URL —
 * hash-ul e singurul input extern controlabil de un atacator (link partajat).
 */
export function isValidId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= LIMITS.ID_MAX_LENGTH
    && /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Verifică dacă obiectul e potențial victima/vehiculul unui prototype pollution.
 *
 * Două vectori de atac diferiți, ambii acoperiți:
 *
 *   A) Literal de obiect în cod: `{"__proto__": {...}}` SCHIMBĂ prototype-ul
 *      obiectului (nu creează own property). Detectăm via getPrototypeOf —
 *      pentru note plain trebuie să fie exact Object.prototype.
 *
 *   B) JSON.parse: `JSON.parse('{"__proto__": ...}')` creează `__proto__` ca
 *      own property (V8 special-case). Detectăm via hasOwnProperty.
 *
 *   C) Plus 'constructor' și 'prototype' — alte vectori clasici (e.g.
 *      `obj.constructor.prototype.isAdmin = true`).
 */
function hasPollutedProto(obj) {
  // A) Prototype efectiv schimbat
  const proto = Object.getPrototypeOf(obj);
  if (proto !== null && proto !== Object.prototype) return true;

  // B + C) Chei rezervate ca own properties
  if (Object.prototype.hasOwnProperty.call(obj, '__proto__')) return true;
  if (Object.prototype.hasOwnProperty.call(obj, 'constructor')) return true;
  if (Object.prototype.hasOwnProperty.call(obj, 'prototype')) return true;

  return false;
}

/**
 * Validează și sanitizează un obiect "note" de origine necunoscută
 * (din JSON importat, din localStorage potențial corupt etc.).
 * Returnează note valid SAU null dacă nu poate fi salvat.
 */
export function validateNote(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (hasPollutedProto(raw)) return null;

  const title = sanitizeTitle(raw.title);
  if (!title) return null;

  return {
    id: isValidId(raw.id) ? raw.id : null, // null → caller va genera unul nou
    title,
    content: sanitizeContent(raw.content),
    tags: sanitizeTags(raw.tags),
    createdAt: isValidEpoch(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: isValidEpoch(raw.updatedAt) ? raw.updatedAt : Date.now(),
    collapsed: Boolean(raw.collapsed),
    isTask:    Boolean(raw.isTask),
    done:      Boolean(raw.done),
    isSun:     Boolean(raw.isSun),
  };
}

/**
 * Parse și validare strictă a unui payload de import (Pasul 5).
 * Aruncă SecurityError la prima problemă detectată — fail fast.
 *
 * Atac vectorii acoperiți:
 *   - JSON masiv (>5MB) → refuz înainte de parse
 *   - JSON malformat → parse error capturat
 *   - Schemă invalidă (lipsește `notes`, nu e array, etc.)
 *   - Prea multe note (>1000) → refuz
 *   - Per-note: orice validări din validateNote()
 */
export function parseAndValidateImport(rawString) {
  if (typeof rawString !== 'string') {
    throw new SecurityError('Input invalid (așteptam string).');
  }
  if (rawString.length === 0) {
    throw new SecurityError('Fișier gol.');
  }
  // Verificare size înainte de parse → economisim CPU pe payload-uri uriașe
  if (rawString.length > LIMITS.JSON_IMPORT_MAX_BYTES) {
    throw new SecurityError(`Fișier prea mare (limită: ${formatBytes(LIMITS.JSON_IMPORT_MAX_BYTES)}).`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawString);
  } catch (err) {
    throw new SecurityError('JSON invalid: ' + err.message);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SecurityError('Payload nu este un obiect.');
  }
  if (hasPollutedProto(parsed)) {
    throw new SecurityError('Payload conține câmpuri rezervate (potențial atac).');
  }
  if (!Array.isArray(parsed.notes)) {
    throw new SecurityError('Câmpul `notes` lipsește sau nu este array.');
  }
  if (parsed.notes.length > LIMITS.NOTES_MAX_COUNT) {
    throw new SecurityError(`Prea multe notițe (max ${LIMITS.NOTES_MAX_COUNT}).`);
  }

  // Validăm fiecare notă; cele invalide sunt SĂRITE (graceful), nu fac întregul import să eșueze
  const validNotes = [];
  let skipped = 0;
  for (const raw of parsed.notes) {
    const valid = validateNote(raw);
    if (valid) {
      if (!valid.id) valid.id = generateId();
      validNotes.push(valid);
    } else {
      skipped++;
    }
  }

  return {
    notes: validNotes,
    skippedCount: skipped,
    importedCount: validNotes.length,
  };
}

/**
 * Creează un rate limiter sliding-window.
 *
 * USAGE:
 *   const lim = createRateLimiter(30, 60_000);  // 30 acțiuni/minut
 *   if (!lim.tryAcquire()) showError('prea rapid');
 *
 * Folosit la form submit pentru a preveni spam-uri accidentale sau script
 * automate care ar adăuga mii de notițe într-o secundă (DoS pe UI și storage).
 */
export function createRateLimiter(maxCalls, windowMs) {
  const timestamps = [];
  return {
    tryAcquire() {
      const now = Date.now();
      const threshold = now - windowMs;
      // Curățăm marcajele expirate
      while (timestamps.length > 0 && timestamps[0] < threshold) {
        timestamps.shift();
      }
      if (timestamps.length >= maxCalls) {
        return false;
      }
      timestamps.push(now);
      return true;
    },
    remaining() {
      return Math.max(0, maxCalls - timestamps.length);
    },
    reset() {
      timestamps.length = 0;
    },
  };
}

/** ID generator (preferă crypto.randomUUID, fallback la pseudo-random). */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Format bytes uman (pentru mesaje de eroare). */
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}