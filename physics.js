/*
 * physics.js — simularea de fizică ce așază nodurile pe ecran (layout
 * „force-directed”, în stilul algoritmului Fruchterman–Reingold).
 *
 * Ideea: tratăm graful ca pe un sistem fizic — toate nodurile se resping între
 * ele (ca sarcinile electrice), iar muchiile trag ca niște arcuri. Lăsat să
 * ruleze, sistemul se așază singur într-o formă aerisită și ușor de citit.
 * Modulul e „pur”: nu atinge DOM-ul sau Canvas-ul — canvas.js desenează rezultatul.
 */

/** Parametri impliciți — pot fi suprascriși la createSimulation(). */
const DEFAULTS = {
  repulsion: 9000,     // Constanta Coulomb (K_r). Mai mare → noduri mai distanțate.
  attraction: 0.025,   // Constanta arc (K_a). Mai mare → muchiile trag mai puternic.
  restLength: 110,     // Lungimea de echilibru a unei muchii, în pixeli.
  centerForce: 0.018,  // Tracțiune spre centru (pe fiecare axă).
  damping: 0.86,       // Factor de fricțiune pe viteză (0-1).
  maxVelocity: 25,     // Limita superioară a |v| → stabilitate numerică.
  minDistance: 1,      // Distanță minimă luată în calcul (evită div by zero).
  alphaDecay: 0.0035,  // Cât scade alpha per tick.
  alphaMin: 0.005,     // Sub această valoare considerăm că simularea a convers (s-a liniștit).
};

/**
 * Creează un obiect de simulare.
 * @param {number} width  — lățime viewport (pixeli logici, nu fizici)
 * @param {number} height — înălțime viewport
 * @param {object} params — override pentru DEFAULTS
 */
export function createSimulation(width, height, params = {}) {
  return {
    width,
    height,
    cfg: { ...DEFAULTS, ...params },
    /** Map id → { x, y, vx, vy, fx, fy, pinned } */
    nodes: new Map(),
    /** Energia globală („alpha”): 1 = agitat, spre 0 = liniștit. Resetată la interacțiuni. */
    alpha: 1,
  };
}

/**
 * Sincronizează nodurile simulării cu lista de notițe din store.
 *   - notițe noi → adăugate cu poziție random near-center, viteză 0
 *   - notițe șterse → eliminate
 *   - notițe existente → poziție păstrată
 * Resetează alpha la 1 pentru a anima inserțiile/ștergerile.
 */
export function syncNodes(sim, notes) {
  const seenIds = new Set();
  let changed = false;

  for (const note of notes) {
    seenIds.add(note.id);
    if (!sim.nodes.has(note.id)) {
      // Spawn aproape de centru cu mic jitter → animație plăcută de "naștere"
      sim.nodes.set(note.id, {
        x: sim.width / 2 + (Math.random() - 0.5) * 80,
        y: sim.height / 2 + (Math.random() - 0.5) * 80,
        vx: 0,
        vy: 0,
        fx: 0,
        fy: 0,
        pinned: false,
      });
      changed = true;
    }
  }

  for (const id of [...sim.nodes.keys()]) {
    if (!seenIds.has(id)) {
      sim.nodes.delete(id);
      changed = true;
    }
  }

  // Trezim simularea dacă structura s-a schimbat
  if (changed) sim.alpha = 1;
}

/**
 * Un pas al simulării. Aplică forțele, integrează, decrementează alpha.
 * @returns {boolean} true dacă simularea încă rulează, false dacă a convers
 */
export function tick(sim, edges) {
  const { cfg } = sim;

  // Sărim peste tot când simularea a convers — economie majoră de CPU/baterie
  if (sim.alpha < cfg.alphaMin) return false;

  const ids = [...sim.nodes.keys()];
  const n = ids.length;

  // 1. Reset forțe acumulate
  for (const node of sim.nodes.values()) {
    node.fx = 0;
    node.fy = 0;
  }

  // 2. Repulsie între toate perechile (O(n²))
  for (let i = 0; i < n; i++) {
    const A = sim.nodes.get(ids[i]);
    for (let j = i + 1; j < n; j++) {
      const B = sim.nodes.get(ids[j]);
      let dx = A.x - B.x;
      let dy = A.y - B.y;
      let dist2 = dx * dx + dy * dy;

      // Anti-singularitate: dacă nodurile sunt suprapuse, perturbăm random
      if (dist2 < cfg.minDistance) {
        dx = (Math.random() - 0.5) * 0.1;
        dy = (Math.random() - 0.5) * 0.1;
        dist2 = dx * dx + dy * dy + 0.01;
      }

      const dist = Math.sqrt(dist2);
      // Clamp forța la K_r → previne spike-uri numerice când nodurile sunt quasi-suprapuse
      const force = Math.min(cfg.repulsion / dist2, cfg.repulsion); // F = K_r / d²
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      // Newton III: forța A→B opusă B→A
      A.fx += fx;
      A.fy += fy;
      B.fx -= fx;
      B.fy -= fy;
    }
  }

  // 3. Atracție pe muchii (arc Hooke)
  for (const edge of edges) {
    const A = sim.nodes.get(edge.source);
    const B = sim.nodes.get(edge.target);
    if (!A || !B) continue;

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Greutatea muchiei (= numărul de tag-uri comune) amplifică forța →
    // notițele mai înrudite semantic stau mai aproape una de alta și vizual
    const k = cfg.attraction * edge.weight;
    const displacement = dist - cfg.restLength;
    const force = k * displacement;

    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    A.fx += fx;
    A.fy += fy;
    B.fx -= fx;
    B.fy -= fy;
  }

  // 4. Forță centripetă — păstrăm graful în viewport
  const cx = sim.width / 2;
  const cy = sim.height / 2;
  for (const node of sim.nodes.values()) {
    node.fx += (cx - node.x) * cfg.centerForce;
    node.fy += (cy - node.y) * cfg.centerForce;
  }

  // 5. Integrare Euler (cea mai simplă metodă numerică: viteză += forță, poziție += viteză),
  //    plus damping (frecare) și scalare cu alpha (forțele slăbesc pe măsură ce ne liniștim)
  const maxV = cfg.maxVelocity;
  const maxV2 = maxV * maxV;

  for (const node of sim.nodes.values()) {
    if (node.pinned) continue; // nodurile fixate (ținute cu drag) nu sunt mișcate de forțe

    node.vx = (node.vx + node.fx * sim.alpha) * cfg.damping;
    node.vy = (node.vy + node.fy * sim.alpha) * cfg.damping;

    // Clamp viteza pentru stabilitate
    const v2 = node.vx * node.vx + node.vy * node.vy;
    if (v2 > maxV2) {
      const scale = maxV / Math.sqrt(v2);
      node.vx *= scale;
      node.vy *= scale;
    }

    node.x += node.vx;
    node.y += node.vy;
  }

  // 6. Cooling: alpha scade liniar
  sim.alpha -= cfg.alphaDecay;
  if (sim.alpha < 0) sim.alpha = 0;

  return true;
}

/**
 * Întoarce nodul de simulare (poziție + viteză) pentru un id, sau undefined.
 * @param {object} sim - simularea creată cu createSimulation()
 * @param {string} id  - id-ul notiței
 */
export function getNode(sim, id) {
  return sim.nodes.get(id);
}

// Raza maximă posibilă a unui nod = NODE_BASE_RADIUS + bonusul pentru grad maxim.
// 18px e umbrela cea mai conservatoare — niciun nod nu va depăși această rază
// indiferent de câte muchii are. Folosit ca margine de siguranță la clamp-ul de viewport
// (nodul rămâne complet vizibil, nu doar centrul lui).
export const NODE_MAX_RADIUS = 18;

/** Setează poziția unui nod (folosit la drag). Resetează viteza.
 *  Clampează la marginile viewport-ului astfel că nodul rămâne vizibil. */
export function setNodePosition(sim, id, x, y) {
  const node = sim.nodes.get(id);
  if (!node) return;
  const r = NODE_MAX_RADIUS;
  node.x = Math.max(r, Math.min(sim.width  - r, x));
  node.y = Math.max(r, Math.min(sim.height - r, y));
  node.vx = 0;
  node.vy = 0;
}

/** "Pin" temporar — nodul nu mai e mutat de forțe (folosit cât e drag). */
export function pinNode(sim, id, pinned) {
  const node = sim.nodes.get(id);
  if (node) node.pinned = pinned;
}

/** Reset alpha la valoarea dată (default 1). Trezește simularea. */
export function reheat(sim, value = 1) {
  sim.alpha = Math.max(sim.alpha, value);
}

/** Redimensionare viewport — păstrează proporția pozițiilor. */
export function resize(sim, width, height) {
  if (sim.width > 0 && sim.height > 0) {
    const sx = width / sim.width;
    const sy = height / sim.height;
    for (const node of sim.nodes.values()) {
      node.x *= sx;
      node.y *= sy;
    }
  }
  sim.width = width;
  sim.height = height;
  reheat(sim, 0.3);
}
