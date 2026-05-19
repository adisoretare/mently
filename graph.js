// Model de graf neorientat derivat din tag-uri. Funcții pure fără efecte secundare.

/**
 * @typedef {Object} Edge
 * @property {string}   source     - id-ul nodului A (canonic: id mai mic lexicografic)
 * @property {string}   target     - id-ul nodului B
 * @property {number}   weight     - număr de tag-uri comune (≥ 1)
 * @property {string[]} sharedTags - lista tag-urilor comune (sortate)
 */

/**
 * @param {Array<{id:string, tags:string[]}>} notes
 * @returns {Edge[]}
 */
export function buildEdges(notes) {
  if (!Array.isArray(notes) || notes.length < 2) return [];

  const tagToNotes = new Map();
  for (const note of notes) {
    if (!note || !Array.isArray(note.tags)) continue;
    for (const tag of note.tags) {
      if (!tagToNotes.has(tag)) tagToNotes.set(tag, new Set());
      tagToNotes.get(tag).add(note.id);
    }
  }

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
 * Găsește "soarele" unei componente — centroidul arborelui BFS.
 *
 * Centroidul = nodul al cărui sub-arbore maxim este cel mai mic.
 * Vizual: cel mai "echilibrat" centru din care toate ramurile se văd la adâncime egală.
 * Dacă există egalitate, preferăm nodul cu grad mai mare; la egalitate de grad, id-ul
 * lexicografic mai mic pentru stabilitate.
 *
 * @param {Set<string>} componentIds
 * @param {Map<string, Set<string>>} adjacency
 * @returns {string} id-ul soarelui
 */
function findSun(componentIds, adjacency) {
  if (componentIds.size === 1) return [...componentIds][0];

  // Alegem un nod de start arbitrar (gradul maxim — stabil lexicografic)
  let start = null, maxDeg = -1;
  for (const id of componentIds) {
    const deg = degreeOf(adjacency, id);
    if (deg > maxDeg || (deg === maxDeg && (start === null || id < start))) {
      maxDeg = deg; start = id;
    }
  }

  const n = componentIds.size;

  // BFS pentru a stabili ordinea de traversare și părintele fiecărui nod
  const parent = new Map([[start, null]]);
  const order  = [start];
  const queue  = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of (adjacency.get(cur) || [])) {
      if (!parent.has(nb) && componentIds.has(nb)) {
        parent.set(nb, cur);
        order.push(nb);
        queue.push(nb);
      }
    }
  }

  // Calculăm dimensiunile sub-arborilor bottom-up (invers față de ordinea BFS)
  const subSize = new Map();
  for (const id of componentIds) subSize.set(id, 1);
  for (let i = order.length - 1; i >= 1; i--) {
    const id = order[i];
    const p  = parent.get(id);
    subSize.set(p, subSize.get(p) + subSize.get(id));
  }

  // Centroidul: nodul unde cel mai mare sub-arbore adiacent ≤ n/2
  // Un sub-arbore adiacent poate fi oricare vecin: copil (subSize[nb]) sau
  // "parintele" (n - subSize[cur]).
  let centroid = start;
  let minMaxSub = Infinity;
  for (const id of componentIds) {
    let maxSub = n - subSize.get(id); // sub-arborele "de sus" (spre rădăcina BFS)
    for (const nb of (adjacency.get(id) || [])) {
      if (componentIds.has(nb) && parent.get(nb) === id) {
        maxSub = Math.max(maxSub, subSize.get(nb));
      }
    }
    if (maxSub < minMaxSub || (maxSub === minMaxSub && (degreeOf(adjacency, id) > degreeOf(adjacency, centroid) || (degreeOf(adjacency, id) === degreeOf(adjacency, centroid) && id < centroid)))) {
      minMaxSub = maxSub;
      centroid = id;
    }
  }
  return centroid;
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
 * @returns {{ depths: Map<string, number>, childCounts: Map<string, number>, bfsParent: Map<string, string|null> }}
 */
function computeDepths(sunId, adjacency) {
  const depths = new Map([[sunId, 0]]);
  const childCounts = new Map();
  const bfsParent = new Map([[sunId, null]]);
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
          bfsParent.set(n, curr);
          queue.push(n);
          kids++;
        }
      }
    }
    childCounts.set(curr, kids);
  }
  return { depths, childCounts, bfsParent };
}

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
 *   childCounts: Map<string, number>,
 *   bfsParent: Map<string, string|null>,
 *   hiddenIds: Set<string>
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
  const bfsParent = new Map();

  // Build per-note flag lookups once — used for sun selection and hiddenIds.
  const collapsedById = new Map(notes.map((n) => [n.id, Boolean(n.collapsed)]));
  const pinnedSunById = new Map(notes.map((n) => [n.id, Boolean(n.isSun)]));

  for (let idx = 0; idx < components.length; idx++) {
    const comp = components[idx];

    // Fiecare nod primește indexul componentei sale — folosit pentru rotația de paletă.
    for (const id of comp) componentIndexById.set(id, idx);

    // Prioritate soare:
    //   1. sunOverrideId (nodul selectat de utilizator) — perspectivă temporară
    //   2. nodul marcat explicit isSun=true în această componentă — alegere persistentă
    //   3. centroidul componentei (fallback) — exclus noduri colapsate
    let sun;
    if (sunOverrideId && comp.has(sunOverrideId)) {
      sun = sunOverrideId;
    } else {
      const pinned = [...comp].find((id) => pinnedSunById.get(id));
      if (pinned) {
        sun = pinned;
      } else {
        const eligible = new Set([...comp].filter((id) => !collapsedById.get(id)));
        sun = findSun(eligible.size > 0 ? eligible : comp, adjacency);
      }
    }

    sunIds.add(sun);

    // BFS adâncimi + copii direcți din soare — acoperă toată componenta
    const { depths: compDepths, childCounts: compChildCounts, bfsParent: compParent } = computeDepths(sun, adjacency);
    for (const [id, d] of compDepths) depths.set(id, d);
    for (const [id, c] of compChildCounts) childCounts.set(id, c);
    for (const [id, p] of compParent) bfsParent.set(id, p);
  }

  // Nodurile complet izolate (fără nicio muchie) nu apar în adjacency →
  // nu au primit adâncime/copii din BFS. Le asignăm 0: sunt propriul lor soare, fără copii.
  for (const note of notes) {
    if (!depths.has(note.id)) {
      depths.set(note.id, 0);
      childCounts.set(note.id, 0);
      bfsParent.set(note.id, null);
    }
  }

  // Compute hiddenIds: a node is hidden iff any strict ancestor in the BFS tree has collapsed=true.
  const hiddenIds = new Set();
  for (const note of notes) {
    let ancestor = bfsParent.get(note.id);
    while (ancestor !== null && ancestor !== undefined) {
      if (collapsedById.get(ancestor)) {
        hiddenIds.add(note.id);
        break;
      }
      ancestor = bfsParent.get(ancestor);
    }
  }

  return { nodes: notes, edges, adjacency, tagFrequency, components, componentIndexById, sunIds, depths, childCounts, bfsParent, hiddenIds };
}
