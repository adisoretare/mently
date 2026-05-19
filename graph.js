/**
 * graph.js — Logica matematică a grafului neorientat
 * =============================================================================
 * DECIZII ARHITECTURALE (Cap. I — Algoritmi specifici):
 *
 * 1. PUR-FUNCȚIONAL
 *    Toate funcțiile sunt fără efecte secundare. Primesc date, întorc date noi.
 *    Beneficii: ușor de testat (unit tests fără mock-uri), thread-safe (poate fi
 *    mutat într-un Web Worker fără refactoring în Pasul 3 dacă apar probleme de
 *    performanță cu mulți noduri).
 *
 * 2. EDGES SUNT DERIVATE, NU STOCATE
 *    Le calculăm din tag-urile notițelor → o singură sursă de adevăr.
 *    Imposibil să existe muchii orfane sau inconsistențe noduri ↔ muchii.
 *
 * 3. INVERTED INDEX pentru calculul muchiilor
 *    Naive O(n²·t) → Optimized O(t · Σ k²) folosind tag→noduri (k = noduri/tag).
 *    Pentru distribuțiile tipice (Zipf), e dramatic mai rapid; pentru n=1000 noduri
 *    și 5 tag-uri medii, diferența e ~200x.
 *
 * 4. CANONICAL EDGE KEY pentru graf NEORIENTAT
 *    Cheia muchiei e `${min(a,b)}|${max(a,b)}` → deduplicare automată; muchia
 *    (A,B) și (B,A) sunt aceeași intrare.
 *
 * 5. PONDERI SEMANTICE
 *    weight = numărul tag-urilor comune. Vizualizat ca grosime de linie în Canvas
 *    (Pasul 3) → utilizatorul vede dintr-o privire "cât de strâns" sunt legate două
 *    notițe.
 * =============================================================================
 */

/**
 * @typedef {Object} Edge
 * @property {string}   source     - id-ul nodului A (canonic: id mai mic lexicografic)
 * @property {string}   target     - id-ul nodului B
 * @property {number}   weight     - număr de tag-uri comune (≥ 1)
 * @property {string[]} sharedTags - lista tag-urilor comune (sortate)
 */

/* ─────────────────────────── Build edges ─────────────────────────── */

/**
 * Construiește muchiile prin inverted index pe tag-uri.
 *
 * Pași:
 *   1. Construim un map tag → Set<noteId>.
 *   2. Pentru fiecare tag, generăm perechile (noteId_i, noteId_j) cu i<j.
 *   3. Acumulăm în edgeMap (cheie canonică) → weight++ și sharedTags.push(tag).
 *
 * @param {Array<{id:string, tags:string[]}>} notes
 * @returns {Edge[]}
 */
export function buildEdges(notes) {
  if (!Array.isArray(notes) || notes.length < 2) return [];

  // Pas 1: inverted index tag → Set<noteId>
  const tagToNotes = new Map();
  for (const note of notes) {
    if (!note || !Array.isArray(note.tags)) continue;
    for (const tag of note.tags) {
      if (!tagToNotes.has(tag)) tagToNotes.set(tag, new Set());
      tagToNotes.get(tag).add(note.id);
    }
  }

  // Pas 2+3: acumulează muchiile cu cheie canonică
  const edgeMap = new Map(); // `${a}|${b}` → Edge

  for (const [tag, idSet] of tagToNotes) {
    if (idSet.size < 2) continue; // un tag deținut de o singură notiță nu produce muchii
    const arr = [...idSet];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        // Cheie canonică: id-ul mai mic prima poziție → muchia e neorientată
        const [a, b] = arr[i] < arr[j] ? [arr[i], arr[j]] : [arr[j], arr[i]];
        const key = `${a}|${b}`;
        let edge = edgeMap.get(key);
        if (!edge) {
          edge = { source: a, target: b, weight: 0, sharedTags: [] };
          edgeMap.set(key, edge);
        }
        edge.weight += 1;
        edge.sharedTags.push(tag);
      }
    }
  }

  // Sortăm sharedTags pentru determinism (util la teste și UI consistent)
  for (const edge of edgeMap.values()) edge.sharedTags.sort();

  return [...edgeMap.values()];
}

/* ─────────────────────────── Adjacency ─────────────────────────── */

/**
 * Adjacency map: id → Set<id>. Lookup O(1) la vecinii unui nod.
 * Necesar pentru BFS (componente conexe) și pentru forțele algoritmului
 * force-directed din Pasul 3.
 *
 * @param {Edge[]} edges
 * @returns {Map<string, Set<string>>}
 */
export function buildAdjacency(edges) {
  const adj = new Map();
  for (const { source, target } of edges) {
    if (!adj.has(source)) adj.set(source, new Set());
    if (!adj.has(target)) adj.set(target, new Set());
    adj.get(source).add(target);
    adj.get(target).add(source);
  }
  return adj;
}

/* ─────────────────────────── BFS — componenta conexă ─────────────────────────── */

/**
 * BFS clasic. Returnează Set-ul id-urilor accesibile din `startId`.
 * Folosit în Pasul 3: click pe un tag → evidențiem componenta conexă.
 *
 * Complexitate: O(V + E) cu cozi FIFO; pentru graf mic, .shift() e ok;
 * dacă apare nevoia (n > 10⁴) trecem la o coadă cu head-pointer (O(1) shift).
 *
 * @param {string} startId
 * @param {Map<string, Set<string>>} adjacency
 * @returns {Set<string>}
 */
export function connectedComponent(startId, adjacency) {
  const visited = new Set([startId]);
  if (!adjacency || !adjacency.has(startId)) return visited;

  const queue = [startId];
  while (queue.length) {
    const curr = queue.shift();
    const neighbors = adjacency.get(curr);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  return visited;
}

/**
 * Calculează TOATE componentele conexe ale grafului. Util pentru statistici
 * și pentru distribuirea pe layout-uri separate dacă există subgrafuri izolate.
 *
 * @param {Array<{id:string}>} notes
 * @param {Map<string, Set<string>>} adjacency
 * @returns {Array<Set<string>>}
 */
export function allConnectedComponents(notes, adjacency) {
  const seen = new Set();
  const components = [];
  for (const note of notes) {
    if (seen.has(note.id)) continue;
    const comp = connectedComponent(note.id, adjacency);
    for (const id of comp) seen.add(id);
    components.push(comp);
  }
  return components;
}

/* ─────────────────────────── Queries pe tag-uri ─────────────────────────── */

/**
 * Toate id-urile notițelor care conțin un tag dat. Tag-ul e normalizat lowercase.
 * Folosit la "click pe tag" → highlight pe Canvas.
 *
 * @param {Array<{id:string, tags:string[]}>} notes
 * @param {string} tag
 * @returns {Set<string>}
 */
export function nodesWithTag(notes, tag) {
  const t = String(tag ?? '').trim().toLowerCase();
  if (!t) return new Set();
  return new Set(
    notes
      .filter((n) => Array.isArray(n.tags) && n.tags.includes(t))
      .map((n) => n.id)
  );
}

/**
 * Frecvența tag-urilor (sortată descendent). Util pentru sidebar — afișăm
 * tag-urile populare ca chips pentru filtrare rapidă.
 *
 * @param {Array<{tags:string[]}>} notes
 * @returns {Array<{tag:string, count:number}>}
 */
export function getTagFrequency(notes) {
  const freq = new Map();
  for (const n of notes) {
    if (!Array.isArray(n.tags)) continue;
    for (const t of n.tags) freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/* ─────────────────────────── Sistemul solar — soare + adâncimi ─────────────────────────── */

/**
 * Returnează gradul unui nod (numărul de vecini).
 * @param {Map<string, Set<string>>} adjacency
 * @param {string} id
 * @returns {number}
 */
function degreeOf(adjacency, id) {
  const neighbors = adjacency.get(id);
  return neighbors ? neighbors.size : 0;
}

/**
 * Găsește "soarele" unei componente — nodul cu cel mai mare grad.
 * La egalitate, alege id-ul cel mai mic (lexicografic) pentru stabilitate —
 * altfel soarele ar "sări" între noduri la fiecare rebuild dacă două noduri
 * au același grad.
 *
 * @param {Set<string>} componentIds
 * @param {Map<string, Set<string>>} adjacency
 * @returns {string} id-ul soarelui
 */
function findSun(componentIds, adjacency) {
  let sun = null;
  let maxDeg = -1;
  for (const id of componentIds) {
    const deg = degreeOf(adjacency, id);
    // Aleg nodul cu grad maxim; la egalitate, id-ul lexicografic mai mic câștigă
    if (deg > maxDeg || (deg === maxDeg && (sun === null || id < sun))) {
      maxDeg = deg;
      sun = id;
    }
  }
  return sun;
}

/**
 * BFS din soare → adâncimi + numărul de copii direcți în arborele BFS.
 *
 * "Copil direct" = vecin cu adâncimea exact depth(curr)+1.
 * Părintele și colegii de pe același nivel NU se numără.
 * Asta e sursa de adevăr pentru dimensionarea nodurilor: un hub care
 * ramifică mult va fi mai mare decât un nod cu multe cross-links la același nivel.
 *
 * DE CE BFS și nu DFS: BFS garantează adâncimea minimă (calea cea mai scurtă).
 * Cu DFS ai putea obține adâncimi arbitrare la noduri bine conectate.
 *
 * @param {string} sunId
 * @param {Map<string, Set<string>>} adjacency
 * @returns {{ depths: Map<string, number>, childCounts: Map<string, number> }}
 */
function computeDepths(sunId, adjacency) {
  const depths = new Map([[sunId, 0]]);
  const childCounts = new Map();
  const queue = [sunId];
  while (queue.length) {
    const curr = queue.shift();
    const d = depths.get(curr);
    let kids = 0;
    const neighbors = adjacency.get(curr);
    if (neighbors) {
      for (const n of neighbors) {
        if (!depths.has(n)) {
          depths.set(n, d + 1);
          queue.push(n);
          kids++;
        }
      }
    }
    childCounts.set(curr, kids);
  }
  return { depths, childCounts };
}

/* ─────────────────────────── Aggregator ─────────────────────────── */

/**
 * Construiește modelul complet într-o singură trecere.
 * Apelat de canvas.js / ui.js la fiecare mutație de store.
 *
 * `sunOverrideId` — dacă utilizatorul a selectat un nod, îl promovăm
 * temporar ca soare al componentei sale. Adâncimile se recalculează din el.
 * Asta dă grafului o perspectivă subiectivă: "cum arată lumea din acest nod?"
 *
 * @param {Array<Note>} notes
 * @param {string|null} sunOverrideId  id-ul nodului selectat (sau null)
 * @returns {{
 *   nodes: Array, edges: Edge[], adjacency: Map,
 *   tagFrequency: Array, components: Array<Set<string>>,
 *   componentIndexById: Map<string, number>,
 *   sunIds: Set<string>,
 *   depths: Map<string, number>,
 *   childCounts: Map<string, number>
 * }}
 */
export function buildGraphModel(notes, sunOverrideId = null) {
  const edges = buildEdges(notes);
  const adjacency = buildAdjacency(edges);
  const tagFrequency = getTagFrequency(notes);
  const components = allConnectedComponents(notes, adjacency);

  const sunIds = new Set();
  const depths = new Map();
  const childCounts = new Map();
  const componentIndexById = new Map();

  for (let idx = 0; idx < components.length; idx++) {
    const comp = components[idx];

    // Fiecare nod primește indexul componentei sale — folosit pentru rotația de paletă.
    for (const id of comp) componentIndexById.set(id, idx);

    // Dacă nodul selectat aparține acestei componente, îl promovăm ca soare.
    // Altfel, folosim nodul cu gradul maxim (cel mai conectat = natural dominant).
    let sun;
    if (sunOverrideId && comp.has(sunOverrideId)) {
      sun = sunOverrideId;
    } else {
      sun = findSun(comp, adjacency);
    }

    sunIds.add(sun);

    // BFS adâncimi + copii direcți din soare — acoperă toată componenta
    const { depths: compDepths, childCounts: compChildCounts } = computeDepths(sun, adjacency);
    for (const [id, d] of compDepths) depths.set(id, d);
    for (const [id, c] of compChildCounts) childCounts.set(id, c);
  }

  // Nodurile complet izolate (fără nicio muchie) nu apar în adjacency →
  // nu au primit adâncime/copii din BFS. Le asignăm 0: sunt propriul lor soare, fără copii.
  for (const note of notes) {
    if (!depths.has(note.id)) {
      depths.set(note.id, 0);
      childCounts.set(note.id, 0);
    }
  }

  return { nodes: notes, edges, adjacency, tagFrequency, components, componentIndexById, sunIds, depths, childCounts };
}
