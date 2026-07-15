// Căutare full-text insensibilă la diacritice. Funcții pure — testabile headless.
//
// PROBLEMA: utilizatorul caută "invatare" și trebuie să găsească "învățare"
// (și invers). Soluția: "folding" — normalizare NFD + eliminarea semnelor
// diacritice combinate + lowercase, aplicată identic pe text și pe query.
//
// PROBLEMA 2 (highlight): după folding, indexurile nu mai corespund textului
// original (un caracter poate deveni 0..n caractere). Construim maparea
// index-cu-index în timpul folding-ului ca să putem evidenția <mark> exact
// pe caracterele originale.

/** Fold un singur șir: NFD → fără combining marks → lowercase. */
export function fold(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Fold cu mapare de indexuri.
 * @returns {{ folded: string, map: number[] }} map[i] = indexul din stringul
 *          original al caracterului care a produs folded[i].
 */
export function foldWithMap(str) {
  const s = String(str ?? '');
  let folded = '';
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const f = s[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (let j = 0; j < f.length; j++) {
      folded += f[j];
      map.push(i);
    }
  }
  return { folded, map };
}

/** True dacă nota se potrivește query-ului (titlu, conținut sau tag-uri). */
export function noteMatches(note, query) {
  const q = fold(query).trim();
  if (!q) return true;
  if (fold(note.title).includes(q)) return true;
  if (fold(note.content).includes(q)) return true;
  return Array.isArray(note.tags) && note.tags.some((tag) => fold(tag).includes(q));
}

/** Filtrează lista de note după query (query gol → toate). */
export function filterNotes(notes, query) {
  const q = fold(query).trim();
  if (!q) return notes;
  return notes.filter((n) => noteMatches(n, q));
}

/**
 * Găsește intervalele [start, end) din textul ORIGINAL care se potrivesc
 * query-ului (după folding). Intervalele sunt sortate și non-suprapuse.
 */
export function matchRanges(text, query) {
  const q = fold(query).trim();
  if (!q) return [];
  const { folded, map } = foldWithMap(text);
  const ranges = [];
  let from = 0;
  while (true) {
    const idx = folded.indexOf(q, from);
    if (idx === -1) break;
    const start = map[idx];
    // ultimul caracter folded al match-ului → indexul original + 1
    const end = map[idx + q.length - 1] + 1;
    ranges.push([start, end]);
    from = idx + q.length;
  }
  return ranges;
}

/**
 * Returnează HTML sigur: textul e escape-uit segment cu segment, iar
 * match-urile sunt învelite în <mark>. `escapeFn` e injectat (escapeHtml din
 * security.js) ca modulul să rămână pur/fără dependențe.
 */
export function highlightHtml(text, query, escapeFn) {
  const s = String(text ?? '');
  const ranges = matchRanges(s, query);
  if (ranges.length === 0) return escapeFn(s);
  let html = '';
  let pos = 0;
  for (const [start, end] of ranges) {
    html += escapeFn(s.slice(pos, start));
    html += `<mark>${escapeFn(s.slice(start, end))}</mark>`;
    pos = end;
  }
  html += escapeFn(s.slice(pos));
  return html;
}
