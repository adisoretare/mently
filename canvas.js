// Renderer Canvas 2D + Pointer Events. Physics în physics.js; UI wiring în ui.js.

import { subscribe, getNotes } from './store.js';
import { buildGraphModel, connectedComponent, nodesWithTag, describeNode } from './graph.js';
import { announce } from './dom.js';
import { t } from './i18n.js';
import {
  createSimulation,
  syncNodes,
  tick,
  setNodePosition,
  pinNode,
  reheat,
  resize,
} from './physics.js';

let canvasEl = null;
let ctx = null;
let sim = null;
let dpr = 1;

// Cache din graph model — refreshed la subscribe
let edges = [];
let adjacency = new Map();
let nodesById = new Map();       // pentru lookup rapid în render

// Modelul complet — necesar pentru inele orbitale și tier rendering
let graphModel = null;
let depths = new Map();          // nodeId → adâncime față de soarele componentei sale
let sunIds = new Set();          // id-urile soarelui din fiecare componentă conexă
let childCounts = new Map();     // nodeId → nr. copii direcți în arborele BFS (pentru sizing)
let componentIndexById = new Map(); // nodeId → index componentă (pentru rotația de paletă)
let hiddenIds = new Set();       // nodeId → hidden because ancestor is collapsed

// Reducere mișcare — citit o singură dată la init, nu per-frame
let motionOK = true;

// Selecții și highlight
let selectedId = null;
let hoveredId = null;
/** Set<string> de id-uri evidențiate (rezultat tag click) sau null. */
let highlightedIds = null;
let activeTag = null;

// Drag state
let isDragging = false;
let dragId = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let pointerDown = null; // { x, y, time, nodeId } pentru detectare click vs drag

const selectListeners = new Set();

// Viewport pan (for focus mode + user pan)
let viewportX = 0;
let viewportY = 0;
let targetVX = 0;
let targetVY = 0;
const VIEWPORT_LERP = 0.12;

/* ─── Zoom + pan + pinch ───
 * Model de transformare: screen = world × zoom + viewport.
 * Codul anterior era cazul particular zoom === 1 — diff-urile rămân minime.
 * După orice interacțiune manuală sincronizăm targetVX/Y = viewportX/Y, astfel
 * lerp-ul de auto-centrare devine no-op până când spotlight-ul re-țintește. */
let zoom = 1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const activePointers = new Map(); // pointerId → {x, y} — pentru pinch cu 2 degete
let pinchStart = null;            // { dist, midX, midY, zoom, viewportX, viewportY }
let isPanning = false;            // drag pe spațiu gol = pan
let lastPanX = 0;
let lastPanY = 0;

// Spotlight (focus mode — dims all non-spotlight nodes)
let spotlightId = null;

// Valorile de mai jos sunt fallback-uri — loadPalette() le suprascrie la init()
// citind CSS vars din style.css (singura sursă de adevăr pentru culori).
// DE CE nu punem hexuri direct: dacă style.css se schimbă, canvas.js se sincronizează
// automat fără să cauți manual în două locuri.
const PALETTE = {
  // Fundal + neutrale
  ink950:   '#0c0a09',
  ink900:   '#1c1917',
  ink800:   '#292524',
  ink700:   '#44403c',
  paper100: '#fafaf9',
  paper300: '#d6d3d1',
  paper500: '#a8a29e',
  // Portocaliu solar (brand)
  signal300: '#fdba74',
  signal400: '#fb923c',
  signal500: '#f97316',
  // Albastru gheață
  azure300:  '#7dd3fc',
  azure400:  '#38bdf8',
  azure500:  '#0ea5e9',
  // Violet aurora
  aurora300: '#c4b5fd',
  aurora400: '#a78bfa',
  aurora500: '#7c3aed',
  // Verde smarald
  jade300:   '#6ee7b7',
  jade400:   '#34d399',
  jade500:   '#10b981',
  // Roșu vulcanic
  crimson300: '#fca5a5',
  crimson400: '#f87171',
  crimson500: '#ef4444',
  // Galben-auriu
  gold300:   '#fcd34d',
  gold400:   '#fbbf24',
  gold500:   '#f59e0b',
};

/**
 * Suprascrie PALETTE cu valorile din CSS vars la runtime.
 * Apelat o singură dată din init() — NICIODATĂ per-frame (ar cauza layout thrashing).
 */
function loadPalette() {
  const cs = getComputedStyle(document.documentElement);
  const get = (varName, fallback) => {
    const val = cs.getPropertyValue(varName).trim();
    return val || fallback;
  };
  PALETTE.ink950   = get('--c-ink-950',   PALETTE.ink950);
  PALETTE.ink900   = get('--c-ink-900',   PALETTE.ink900);
  PALETTE.ink800   = get('--c-ink-800',   PALETTE.ink800);
  PALETTE.ink700   = get('--c-ink-700',   PALETTE.ink700);
  PALETTE.paper100 = get('--c-paper-100', PALETTE.paper100);
  PALETTE.paper300 = get('--c-paper-300', PALETTE.paper300);
  PALETTE.paper500 = get('--c-paper-500', PALETTE.paper500);
  PALETTE.signal300 = get('--c-signal-300', PALETTE.signal300);
  PALETTE.signal400 = get('--c-signal-400', PALETTE.signal400);
  PALETTE.signal500 = get('--c-signal-500', PALETTE.signal500);
  // Paletă extinsă — citite din CSS vars, fallback la hexuri de mai sus
  PALETTE.azure300  = get('--c-azure-300',   PALETTE.azure300);
  PALETTE.azure400  = get('--c-azure-400',   PALETTE.azure400);
  PALETTE.azure500  = get('--c-azure-500',   PALETTE.azure500);
  PALETTE.aurora300 = get('--c-aurora-300',  PALETTE.aurora300);
  PALETTE.aurora400 = get('--c-aurora-400',  PALETTE.aurora400);
  PALETTE.aurora500 = get('--c-aurora-500',  PALETTE.aurora500);
  PALETTE.jade300   = get('--c-jade-300',    PALETTE.jade300);
  PALETTE.jade400   = get('--c-jade-400',    PALETTE.jade400);
  PALETTE.jade500   = get('--c-jade-500',    PALETTE.jade500);
  PALETTE.crimson300 = get('--c-crimson-300', PALETTE.crimson300);
  PALETTE.crimson400 = get('--c-crimson-400', PALETTE.crimson400);
  PALETTE.crimson500 = get('--c-crimson-500', PALETTE.crimson500);
  PALETTE.gold300   = get('--c-gold-300',    PALETTE.gold300);
  PALETTE.gold400   = get('--c-gold-400',    PALETTE.gold400);
  PALETTE.gold500   = get('--c-gold-500',    PALETTE.gold500);
}

const NODE_BASE_RADIUS    = 6;    // raza de bază pentru orice nod
const NODE_DEGREE_RADIUS  = 1.6;  // bonus de rază per grad (conexiune)
const NODE_MAX_DEGREE_BONUS = 6;  // capul bonusului de grad

const CLICK_DISTANCE_MAX = 5;    // px — sub această distanță, e click nu drag
const CLICK_TIME_MAX = 300;      // ms

// Inele orbitale — cache cu lerp pentru a elimina jitter-ul când fizica se stabilizează
const RING_SMOOTH_ALPHA = 0.08;  // factor de interpolare per-frame (~100ms la jumătate-convergere)
const ringRadiiBySun = new Map(); // sunId → { r1, r2 } — razele inelelor smoothed

// Paletă per-componentă — 8 familii de culori complet distincte (hue diferit fiecare).
// sun/inner   = culoarea disc-ului soarelui / planetei interioare
// midStroke   = conturul + inelul planetei gazoase
// bandA/bandB = benzile atmosferice ale planetei gazoase
// outerFill   = fill-ul planetei externe
// outerStroke = conturul + crescentul planetei externe
const COMPONENT_PALETTES = [
  // 0 — Portocaliu solar (brand, default)
  { sun: 'signal400',  inner: 'signal300',  midStroke: 'signal500',  bandA: 'signal500',  bandB: 'signal300',  outerFill: 'ink900', outerStroke: 'signal300'  },
  // 1 — Albastru gheață (planetă îngheżată)
  { sun: 'azure400',   inner: 'azure300',   midStroke: 'azure500',   bandA: 'azure300',   bandB: 'azure500',   outerFill: 'ink800', outerStroke: 'azure300'   },
  // 2 — Violet aurora (nebuloasă)
  { sun: 'aurora400',  inner: 'aurora300',  midStroke: 'aurora500',  bandA: 'aurora300',  bandB: 'aurora500',  outerFill: 'ink900', outerStroke: 'aurora300'  },
  // 3 — Verde smarald (planetă vie, oceane)
  { sun: 'jade400',    inner: 'jade300',    midStroke: 'jade500',    bandA: 'jade300',    bandB: 'jade500',    outerFill: 'ink800', outerStroke: 'jade300'    },
  // 4 — Roșu vulcanic (Mars, lava)
  { sun: 'crimson400', inner: 'crimson300', midStroke: 'crimson500', bandA: 'crimson300', bandB: 'crimson500', outerFill: 'ink900', outerStroke: 'crimson300' },
  // 5 — Galben-auriu (gigant gazos, Jupiter)
  { sun: 'gold400',    inner: 'gold300',    midStroke: 'gold500',    bandA: 'gold300',    bandB: 'gold500',    outerFill: 'ink800', outerStroke: 'gold300'    },
  // 6 — Portocaliu + albastru (sistem binar — două stele de culori diferite)
  { sun: 'signal400',  inner: 'azure300',   midStroke: 'azure400',   bandA: 'azure300',   bandB: 'signal300',  outerFill: 'ink900', outerStroke: 'azure300'   },
  // 7 — Violet + verde (sistem exotic, stea carbon)
  { sun: 'aurora400',  inner: 'jade300',    midStroke: 'aurora500',  bandA: 'jade400',    bandB: 'aurora300',  outerFill: 'ink800', outerStroke: 'jade300'    },
];

/**
 * Calculează raza unui nod pe baza numărului de copii BFS și a tier-ului.
 *
 * "Copii" = noduri din arborele BFS ramificate direct din acest nod (nu cross-links,
 * nu părintele). Un hub care desparte o componentă în mai multe ramuri va fi mai mare
 * decât un nod cu mulți vecini la același nivel.
 *
 * Centralizăm formula aici pentru a o reutiliza în render() ȘI în findNodeAt().
 * Dacă am duplica-o, o editare ar crea discrepanțe vizual ↔ hit-testing.
 *
 * @param {number} childCount - numărul de copii direcți în arborele BFS
 * @param {number} depth      - adâncimea BFS față de soarele componentei (0 = soare)
 * @returns {number} raza în pixeli logici
 */
function nodeRadius(childCount, depth) {
  const bonus = Math.min(childCount, NODE_MAX_DEGREE_BONUS) * NODE_DEGREE_RADIUS;
  if (depth === 0) return NODE_BASE_RADIUS + 8 + bonus;  // soare: semnificativ mai mare
  if (depth === 1) return NODE_BASE_RADIUS + bonus;       // planet interior: normal + bonus
  if (depth === 2) return NODE_BASE_RADIUS;               // gazos: raza de bază, uniform
  return Math.max(3, NODE_BASE_RADIUS * 0.75);            // extern: mai mic, minim 3px
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Factorul de pulsare al soarelui — variație lentă ±4%.
 * Returnează 1 dacă utilizatorul preferă mișcare redusă.
 * Apelat în render() (vizual) ȘI în findNodeAt() (hit-testing) pentru sincronizare.
 */
function currentPulseScale() {
  return motionOK ? (1 + 0.04 * Math.sin(performance.now() * 0.0018)) : 1;
}

export function reloadPalette() {
  loadPalette();
}

export function init(canvas) {
  if (!canvas) {
    console.error('[canvas] Element canvas lipsă');
    return;
  }
  canvasEl = canvas;
  ctx = canvas.getContext('2d');

  // Citim paleta din CSS vars — o singură dată, nu per-frame
  loadPalette();

  // Verificăm prefers-reduced-motion o singură dată la init.
  // DE CE nu per-frame: matchMedia e ieftin, dar schimbarea redă UI inconsistent
  // la mijlocul unei animații. Dacă userul schimbă preferința, reîncarcă pagina.
  motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  resizeToContainer();
  sim = createSimulation(getLogicalWidth(), getLogicalHeight());

  refreshFromStore();
  subscribe(refreshFromStore);

  // Pointer Events: unified mouse + touch + pen
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp); // global → catch drag release outside canvas
  canvas.addEventListener('pointercancel', handlePointerUp);

  // Zoom cu rotița — passive:false ca preventDefault să blocheze scroll-ul paginii
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // Keyboard: Esc curăță selecție + highlight
  window.addEventListener('keydown', handleKeydown);

  // Resize cu debounce ușor (requestAnimationFrame coalescing)
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resizeToContainer);
  }, { passive: true });

  // Reheat la revenirea pe tab — nodurile s-au putut mișca (adăugări, ștergeri) cât
  // tabul era ascuns iar loop-ul era oprit (document.hidden gate în funcția loop()).
  // DE CE α=0.3: suficient să repozitioneze noduri noi fără să destabilizeze un
  // graf deja conversat. Valoare de la 1.0 (haos) scade exponențial la fiecare tick.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reheat(sim, 0.3);
  });

  // Pornește bucla
  requestAnimationFrame(loop);
}

function refreshFromStore() {
  const notes = getNotes();
  // Pasăm selectedId ca override de soare — astfel nodul selectat devine centrul
  // perspectivei pentru componenta sa, iar adâncimile se recalculează din el.
  const model = buildGraphModel(notes, selectedId);

  graphModel       = model;
  edges            = model.edges;
  adjacency        = model.adjacency;
  depths           = model.depths;
  sunIds           = model.sunIds;
  childCounts      = model.childCounts;
  componentIndexById = model.componentIndexById;
  hiddenIds        = model.hiddenIds;
  nodesById        = new Map(notes.map((n) => [n.id, n]));

  if (sim) syncNodes(sim, notes);

  // Dacă tag-ul activ a dispărut din note, curățăm highlight-ul
  if (activeTag) {
    const stillExists = notes.some((n) => n.tags.includes(activeTag));
    if (!stillExists) clearHighlight();
  }
}

function loop() {
  // Sari tick + render când tab-ul e ascuns (browser throttlează rAF, dar economisim și mai mult)
  if (!document.hidden) {
    if (sim.nodes.size > 0) tick(sim, edges);

    // Lerp viewport toward target (for focus mode pan)
    if (motionOK) {
      viewportX += (targetVX - viewportX) * VIEWPORT_LERP;
      viewportY += (targetVY - viewportY) * VIEWPORT_LERP;
    } else {
      viewportX = targetVX;
      viewportY = targetVY;
    }

    render();
  }
  requestAnimationFrame(loop);
}

function render() {
  const w = getLogicalWidth();
  const h = getLogicalHeight();

  // Clear pe transparent → texturile bg-grain + vignette din spate se văd
  ctx.clearRect(0, 0, w, h);  // clear before translate — covers full canvas

  const hasHighlight = highlightedIds !== null;
  const hasSpotlight = spotlightId !== null;

  ctx.save();
  ctx.translate(viewportX, viewportY);
  ctx.scale(zoom, zoom);

  // 0. Inele orbitale — cel mai de jos strat, înainte de muchii și noduri
  renderOrbitalRings();

  // 1. Edges (sub noduri)
  for (const edge of edges) {
    if (hiddenIds.has(edge.source) || hiddenIds.has(edge.target)) continue;
    const A = sim.nodes.get(edge.source);
    const B = sim.nodes.get(edge.target);
    if (!A || !B) continue;

    if (hasSpotlight) {
      const touchesSpotlight = edge.source === spotlightId || edge.target === spotlightId;
      if (!touchesSpotlight) {
        ctx.globalAlpha = 0.08;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.strokeStyle = PALETTE.ink800;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
    }

    const isActive = !hasHighlight || (highlightedIds.has(edge.source) && highlightedIds.has(edge.target));
    const touchesSelected = selectedId && (edge.source === selectedId || edge.target === selectedId);
    const touchesHovered  = hoveredId  && (edge.source === hoveredId  || edge.target === hoveredId);

    let color, alpha, lineWidth;
    if (touchesSelected) {
      color = PALETTE.signal400; alpha = 0.9; lineWidth = Math.min(1 + edge.weight * 0.6, 3.5);
    } else if (touchesHovered) {
      color = PALETTE.signal300; alpha = 0.7; lineWidth = Math.min(0.8 + edge.weight * 0.5, 3);
    } else if (isActive) {
      color = PALETTE.ink700; alpha = 0.7; lineWidth = Math.min(0.5 + edge.weight * 0.4, 2.5);
    } else {
      color = PALETTE.ink800; alpha = 0.15; lineWidth = 0.5;
    }

    // Muchiile din sistemul exterior (depth mare) sunt mai estompate — ochiul rămâne
    // ancrat pe soare și pe planetele interioare mai luminoase.
    if (isActive && !touchesSelected && !touchesHovered) {
      const dA = depths.get(edge.source) ?? 0;
      const dB = depths.get(edge.target) ?? 0;
      const maxDepth = Math.max(dA, dB);
      alpha *= (0.6 + 0.4 * (1 - Math.min(maxDepth, 5) / 5));
    }

    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 2. Nodes — cu tier-ul calculat din adâncime
  for (const [id, note] of nodesById) {
    if (hiddenIds.has(id)) continue;
    const node = sim.nodes.get(id);
    if (!node) continue;

    const childCount = childCounts.get(id) ?? 0;
    const depth      = depths.get(id) ?? 0;
    const isSelected = id === selectedId;
    const isHovered  = id === hoveredId;
    const isHighlighted = hasHighlight && highlightedIds.has(id);
    const isInactive    = hasHighlight && !isHighlighted;

    if (hasSpotlight) {
      ctx.globalAlpha = id === spotlightId ? 1 : 0.15;
    } else {
      ctx.globalAlpha = isInactive ? 0.2 : 1;
    }

    renderNode(node, note, id, childCount, depth, isSelected, isHovered, isHighlighted);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

/**
 * Desenează inele orbitale transparente în jurul fiecărui soare.
 *
 * Razele sunt interpolare (lerp cu RING_SMOOTH_ALPHA) față de distanța medie reală
 * a nodurilor de la depth 1 și 2 în fiecare frame. Fără lerp, inelele ar sălta vizibil
 * pe măsură ce fizica se stabilizează — cu lerp, alunecă lin în ~100ms.
 * Cache-ul `ringRadiiBySun` e curățat de intrările neutilizate la finalul fiecărui frame
 * (sun-uri care au dispărut la ștergerea de notițe).
 *
 * Limităm la top 5 componente (după dimensiune) pentru a evita zgomotul vizual
 * când există zeci de componente mici.
 */
function renderOrbitalRings() {
  if (!graphModel || graphModel.sunIds.size === 0) return;

  const sorted = [...graphModel.components].sort((a, b) => b.size - a.size);
  const topComponents = sorted.slice(0, 5);
  const seen = new Set(); // urmărim care sun-uri sunt active în acest frame

  ctx.save();
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = PALETTE.signal400;

  for (const comp of topComponents) {
    if (comp.size < 4) continue;

    let sun = null;
    for (const id of comp) {
      if (graphModel.sunIds.has(id)) { sun = id; break; }
    }
    if (!sun) continue;

    const sunNode = sim.nodes.get(sun);
    if (!sunNode) continue;
    seen.add(sun);

    // Calculăm razele țintă din pozițiile live
    let d1sum = 0, d1cnt = 0, d2sum = 0, d2cnt = 0;
    for (const id of comp) {
      const d = depths.get(id);
      const node = sim.nodes.get(id);
      if (!node || d === 0) continue;
      const dist = Math.sqrt(
        (node.x - sunNode.x) * (node.x - sunNode.x) +
        (node.y - sunNode.y) * (node.y - sunNode.y)
      );
      if (d === 1) { d1sum += dist; d1cnt++; }
      else if (d === 2) { d2sum += dist; d2cnt++; }
    }

    const targetR1 = d1cnt > 0 ? d1sum / d1cnt : 0;
    const targetR2 = d2cnt > 0 ? d2sum / d2cnt : 0;

    // Lerp spre raza țintă — prima apariție inițializează direct la valoarea reală
    let cache = ringRadiiBySun.get(sun);
    if (!cache) {
      cache = { r1: targetR1, r2: targetR2 };
      ringRadiiBySun.set(sun, cache);
    } else {
      if (targetR1 > 0) cache.r1 += (targetR1 - cache.r1) * RING_SMOOTH_ALPHA;
      if (targetR2 > 0) cache.r2 += (targetR2 - cache.r2) * RING_SMOOTH_ALPHA;
    }

    ctx.lineWidth = 0.75;
    if (cache.r1 > 2) {
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      ctx.arc(sunNode.x, sunNode.y, cache.r1, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (cache.r2 > 2) {
      ctx.globalAlpha = 0.04;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(sunNode.x, sunNode.y, cache.r2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Curățăm intrările stale (componente care au dispărut între timp)
  for (const key of ringRadiiBySun.keys()) {
    if (!seen.has(key)) ringRadiiBySun.delete(key);
  }

  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Dispatcher central: alege funcția de render corespunzătoare tier-ului
 * și adaugă label-ul deasupra.
 * Paleta per-componentă e selectată din COMPONENT_PALETTES și pasată în tier-render.
 */
function renderNode(node, note, id, childCount, depth, isSelected, isHovered, isHighlighted) {
  const tier = depth === 0 ? 0 : depth === 1 ? 1 : depth === 2 ? 2 : 3;
  const r = nodeRadius(childCount, depth);

  // done notes are dimmed
  const baseAlpha = note.done ? 0.45 : 1;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * baseAlpha;

  // Pulsarea soarelui — variație lentă de ±4%; `currentPulseScale` returnează 1
  // dacă prefers-reduced-motion e activ. Același calcul e folosit și în findNodeAt
  // pentru sincronizarea hit-testingului cu vizualul.
  const rr = tier === 0 ? r * currentPulseScale() : r;

  // Paletă determinisă bazată pe indexul componentei — zero randomness la re-render
  const compIdx = componentIndexById.get(id) ?? 0;
  const pal = COMPONENT_PALETTES[compIdx % COMPONENT_PALETTES.length];

  switch (tier) {
    case 0: renderSun(node, rr, isSelected, isHovered, pal); break;
    case 1: renderInnerPlanet(node, rr, isSelected, isHovered, pal); break;
    case 2: renderMidPlanet(node, rr, isSelected, isHovered, pal); break;
    case 3: renderOuterPlanet(node, rr, isSelected, isHovered, pal); break;
  }

  // Label — vizibil diferit pe tier
  const showProminentLabel = isSelected || isHovered;
  const showLabel = showProminentLabel
    || isHighlighted
    || tier === 0                // soarele are label mereu vizibil
    || (tier === 1 && childCount > 0); // planetele interioare cu ramuri sub ele

  if (showLabel) {
    renderNodeLabel(node, note, r, showProminentLabel);
  }

  ctx.globalAlpha = prevAlpha;

  // Badges: collapse indicator (top-right) and task/done (top-left)
  renderNodeBadges(node, note, r, childCount);
}

/**
 * Tier 0 — Soarele.
 * Textură: coroană pulsantă + limb darkening (bordul mai întunecat, realist) +
 * flare speculară în colțul stânga-sus (reflexie de lumină proprie).
 */
function renderSun(node, r, isSelected, isHovered, pal) {
  const sunColor = PALETTE[pal.sun];

  // Coroana — gradient radial larg în culoarea componentei
  const haloR = r * 2.5;
  const corona = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, haloR);
  corona.addColorStop(0,   hexToRgba(sunColor, 0.35));
  corona.addColorStop(0.5, hexToRgba(sunColor, 0.10));
  corona.addColorStop(1,   hexToRgba(sunColor, 0));
  ctx.fillStyle = corona;
  ctx.beginPath();
  ctx.arc(node.x, node.y, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Halo de selecție — mereu signal-400 (indicator UX consistent cross-componentă)
  if (isSelected) {
    const selHalo = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 16);
    selHalo.addColorStop(0, 'rgba(251,146,60,0.65)');
    selHalo.addColorStop(1, 'rgba(251,146,60,0)');
    ctx.fillStyle = selHalo;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 16, 0, Math.PI * 2);
    ctx.fill();
  }

  // Disc — culoare de bază
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fillStyle = isHovered ? PALETTE[pal.inner] : sunColor;
  ctx.fill();

  // Limb darkening — bord mai întunecat (soarele real emite mai puțin lumină la margine)
  const limb = ctx.createRadialGradient(node.x, node.y, r * 0.3, node.x, node.y, r);
  limb.addColorStop(0,   'rgba(0,0,0,0)');
  limb.addColorStop(0.7, 'rgba(0,0,0,0)');
  limb.addColorStop(1,   'rgba(0,0,0,0.38)');
  ctx.fillStyle = limb;
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Flare speculară — punct luminos stânga-sus (auto-reflexie stelară)
  const fx = node.x - r * 0.32, fy = node.y - r * 0.32;
  const flare = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 0.48);
  flare.addColorStop(0,   'rgba(255,255,255,0.55)');
  flare.addColorStop(0.4, 'rgba(255,255,255,0.15)');
  flare.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = flare;
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Tier 1 — Planet interior.
 * Textură: atmosferă fină + shading 3D (highlight stânga-sus, umbră dreapta-jos) +
 * mic punct specular (reflexia directă a soarelui).
 */
function renderInnerPlanet(node, r, isSelected, isHovered, pal) {
  const innerColor = PALETTE[pal.inner];

  // Atmosferă — halou exterior subtil
  const atmoR = r * 1.6;
  const atmo = ctx.createRadialGradient(node.x, node.y, r * 0.7, node.x, node.y, atmoR);
  atmo.addColorStop(0, hexToRgba(innerColor, 0.14));
  atmo.addColorStop(1, hexToRgba(innerColor, 0));
  ctx.fillStyle = atmo;
  ctx.beginPath();
  ctx.arc(node.x, node.y, atmoR, 0, Math.PI * 2);
  ctx.fill();

  if (isSelected) {
    const selHalo = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 11);
    selHalo.addColorStop(0, 'rgba(251,146,60,0.55)');
    selHalo.addColorStop(1, 'rgba(251,146,60,0)');
    ctx.fillStyle = selHalo;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 11, 0, Math.PI * 2);
    ctx.fill();
  }

  // Disc — culoare de bază
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fillStyle = (isSelected || isHovered) ? PALETTE[pal.sun] : innerColor;
  ctx.fill();

  // Highlight 3D stânga-sus — simulează iluminarea de la soare
  const hlX = node.x - r * 0.28, hlY = node.y - r * 0.28;
  const hl = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, r * 0.9);
  hl.addColorStop(0,   'rgba(255,255,255,0.38)');
  hl.addColorStop(0.45,'rgba(255,255,255,0.08)');
  hl.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Umbră dreapta-jos — latura opusă soarelui (terminator subtil)
  const shX = node.x + r * 0.22, shY = node.y + r * 0.22;
  const shadow = ctx.createRadialGradient(shX, shY, 0, shX, shY, r * 0.85);
  shadow.addColorStop(0,   'rgba(0,0,0,0)');
  shadow.addColorStop(0.5, 'rgba(0,0,0,0.08)');
  shadow.addColorStop(1,   'rgba(0,0,0,0.28)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Contur de atmosferă (separare vizuală față de spațiu)
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(250,250,249,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Tier 2 — Planet gazos (mid).
 * Textură: benzi atmosferice orizontale clipate la disc (Jupiter/Saturn look) +
 * highlight polar superior + inel dashed exterior în culoarea componentei.
 */
function renderMidPlanet(node, r, isSelected, isHovered, pal) {
  const midStrokeColor = PALETTE[pal.midStroke];
  const bandColorA     = PALETTE[pal.bandA];
  const bandColorB     = PALETTE[pal.bandB];

  if (isSelected) {
    const selHalo = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 11);
    selHalo.addColorStop(0, 'rgba(251,146,60,0.5)');
    selHalo.addColorStop(1, 'rgba(251,146,60,0)');
    ctx.fillStyle = selHalo;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 11, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inel planetar dashed — în fața haloului, în spatele corpului
  ctx.save();
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.arc(node.x, node.y, r * 1.55, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(midStrokeColor, 0.22);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Corp de bază — întunecat (spațiu cosmic fără lumina directă a soarelui)
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.ink900;
  ctx.fill();

  // Benzi atmosferice — vizibile doar dacă planeta e suficient de mare (r ≥ 5px)
  // Clip la disc → benzile nu ies niciodată în afara conturului planetei.
  if (r >= 5) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, r - 0.5, 0, Math.PI * 2);
    ctx.clip();

    // Bandă ecuatorială superioară — mai luminoasă, culoar de vânt calid
    ctx.beginPath();
    ctx.ellipse(node.x, node.y - r * 0.18, r, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(bandColorA, 0.2);
    ctx.fill();

    // Bandă ecuatorială inferioară — mai subtilă, culoar de vânt rece
    ctx.beginPath();
    ctx.ellipse(node.x, node.y + r * 0.38, r, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(bandColorB, 0.15);
    ctx.fill();

    ctx.restore();
  }

  // Highlight polar — reflexie difuză în vârf (lumina stelelor îndepărtate)
  const polX = node.x, polY = node.y - r * 0.5;
  const polar = ctx.createRadialGradient(polX, polY, 0, polX, polY, r * 0.55);
  polar.addColorStop(0, hexToRgba(midStrokeColor, 0.28));
  polar.addColorStop(1, hexToRgba(midStrokeColor, 0));
  ctx.fillStyle = polar;
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Contur — selecție rămâne signal-400 pentru consistență cross-componentă
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = isSelected ? PALETTE.signal400 : (isHovered ? PALETTE[pal.inner] : midStrokeColor);
  ctx.lineWidth = isSelected ? 2 : 1.5;
  ctx.stroke();
}

/**
 * Tier 3 — Planet extern (rece).
 * Textură: fill ușor diferit per componentă (outerFill) + efect crescent —
 * un gradient radial de pe latura stânga-sus mimează lumina slabă reflectată.
 * Rămâne mic și discret: e marginea sistemului solar, nu centrul atenției.
 */
function renderOuterPlanet(node, r, isSelected, isHovered, pal) {
  const outerStrokeColor = PALETTE[pal.outerStroke];
  const outerFillColor   = PALETTE[pal.outerFill];

  if (isSelected) {
    const selHalo = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 9);
    selHalo.addColorStop(0, 'rgba(251,146,60,0.45)');
    selHalo.addColorStop(1, 'rgba(251,146,60,0)');
    ctx.fillStyle = selHalo;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Corp — fill întunecat, ușor diferit per componentă
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(outerFillColor, 0.88);
  ctx.fill();

  // Efect crescent — gradient radial de pe latura stânga-sus simulează lumina
  // slabă reflectată de pe un corp îndepărtat de soare. Ușor vizibil, nu strident.
  const cresX = node.x - r * 0.55, cresY = node.y - r * 0.55;
  const cres = ctx.createRadialGradient(cresX, cresY, 0, node.x, node.y, r);
  cres.addColorStop(0,    'rgba(255,255,255,0)');
  cres.addColorStop(0.72, hexToRgba(outerStrokeColor, 0.1));
  cres.addColorStop(1,    hexToRgba(outerStrokeColor, 0.32));
  ctx.fillStyle = cres;
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Contur slab — selecție override la signal-400
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = isSelected
    ? PALETTE.signal400
    : (isHovered ? PALETTE.signal300 : hexToRgba(outerStrokeColor, 0.55));
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Label de text deasupra nodului.
 * Versiunea "prominentă" (selected/hovered): font bold, pill de fundal, text alb.
 * Versiunea simplă: font mic, text paper-500.
 */
function renderNodeLabel(node, note, r, prominent) {
  ctx.font = prominent ? '500 12px Geist, sans-serif' : '11px Geist, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const maxLen = prominent ? 32 : 24;
  const label = note.title.length > maxLen ? note.title.slice(0, maxLen) + '…' : note.title;
  const labelY = node.y + r + 6;

  // Pill de fundal pentru labels prominente — îmbunătățește lizibilitatea peste muchii/noduri
  if (prominent) {
    const metrics = ctx.measureText(label);
    const padX = 6, padY = 3;
    ctx.fillStyle = 'rgba(12,10,9,0.88)';
    ctx.beginPath();
    roundRect(ctx, node.x - metrics.width / 2 - padX, labelY - padY + 1, metrics.width + padX * 2, 14 + padY * 2, 3);
    ctx.fill();
    ctx.fillStyle = PALETTE.paper100;
  } else {
    ctx.fillStyle = PALETTE.paper500;
  }

  ctx.fillText(label, node.x, labelY);

  // Strikethrough for done tasks
  if (note.done) {
    const metrics = ctx.measureText(label);
    const midY = labelY + 6;
    ctx.beginPath();
    ctx.moveTo(node.x - metrics.width / 2, midY);
    ctx.lineTo(node.x + metrics.width / 2, midY);
    ctx.strokeStyle = prominent ? PALETTE.paper300 : PALETTE.paper500;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/**
 * Adornment badges drawn on top of node glyph.
 * Top-left: task checkbox (filled if done).
 * Top-right: collapse chip "+N" when children are hidden.
 */
function renderNodeBadges(node, note, r, childCount) {
  const badgeR = 5;

  // Task badge (top-left)
  if (note.isTask) {
    const bx = node.x - r * 0.65;
    const by = node.y - r * 0.65;
    ctx.save();
    ctx.globalAlpha = 1;
    // Outer ring
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = note.done ? PALETTE.jade400 : PALETTE.ink800;
    ctx.fill();
    ctx.strokeStyle = note.done ? PALETTE.jade500 : PALETTE.paper500;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (note.done) {
      // Checkmark
      ctx.beginPath();
      ctx.moveTo(bx - 2.5, by);
      ctx.lineTo(bx - 0.5, by + 2);
      ctx.lineTo(bx + 2.5, by - 2);
      ctx.strokeStyle = PALETTE.ink950;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pinned-sun badge (bottom-right) — small star when isSun=true and node is NOT already sun by selection
  if (note.isSun) {
    const bx = node.x + r * 0.65;
    const by = node.y + r * 0.65;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.gold400;
    ctx.fillText('★', bx, by);
    ctx.restore();
  }

  // Collapse badge (top-right) — only when collapsed and has direct children
  if (note.collapsed && childCount > 0) {
    const bx = node.x + r * 0.65;
    const by = node.y - r * 0.65;
    const label = `+${childCount}`;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.font = '500 8px Geist, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    const pw = tw / 2 + 3;
    ctx.fillStyle = PALETTE.signal400;
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(pw, badgeR), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.ink950;
    ctx.fillText(label, bx, by + 0.5);
    ctx.restore();
  }
}

/** Helper pentru colțuri rotunjite (pill labels). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function getLogicalWidth()  { return canvasEl.width  / dpr; }
function getLogicalHeight() { return canvasEl.height / dpr; }

function resizeToContainer() {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  dpr = window.devicePixelRatio || 1;
  canvasEl.width  = Math.round(rect.width  * dpr);
  canvasEl.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (sim) resize(sim, rect.width, rect.height);
}

/** Transformă coordonatele mouse-ului în coordonate logice ale canvas-ului. */
function pointerToCanvas(clientX, clientY) {
  const rect = canvasEl.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/**
 * Picking: găsește nodul sub punctul (x, y) sau returnează null.
 * Folosim `nodeRadius` — același helper ca în render — ca să nu existe
 * discrepanță între ce vede utilizatorul și ce detectează click-ul.
 */
function findNodeAt(x, y) {
  let best = null;
  let bestDist2 = Infinity;
  // Calculăm pulseScale o singură dată pentru tot loop-ul — aceeași valoare ca în render()
  const ps = currentPulseScale();
  for (const [id] of nodesById) {
    if (hiddenIds.has(id)) continue;
    const node = sim.nodes.get(id);
    if (!node) continue;
    const depth = depths.get(id) ?? 0;
    const r = nodeRadius(childCounts.get(id) ?? 0, depth);
    // Soarele pulsează — hit-testingul folosește același factor ca vizualul
    const rVis = depth === 0 ? r * ps : r;
    // screen → world: inversul transformării din render()
    const dx = (x - viewportX) / zoom - node.x;
    const dy = (y - viewportY) / zoom - node.y;
    const dist2 = dx * dx + dy * dy;
    const hitR = rVis + 4 / zoom; // padding de confort constant PE ECRAN, nu în world
    if (dist2 <= hitR * hitR && dist2 < bestDist2) {
      best = id;
      bestDist2 = dist2;
    }
  }
  return best;
}

/** screen → world (inversul transformării de render). */
function screenToWorld(x, y) {
  return { x: (x - viewportX) / zoom, y: (y - viewportY) / zoom };
}

function handlePointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return; // doar left click / primary touch
  if (spotlightId !== null) return; // focus mode active — disable all canvas interaction
  // setPointerCapture poate arunca NotFoundError dacă pointerul a fost deja
  // eliberat între eveniment și handler (sau la evenimente sintetice din teste).
  try { canvasEl.setPointerCapture?.(e.pointerId); } catch { /* non-fatal */ }

  const { x, y } = pointerToCanvas(e.clientX, e.clientY);
  activePointers.set(e.pointerId, { x, y });

  // Al 2-lea deget → intrăm în pinch: anulăm orice drag de nod în curs
  if (activePointers.size === 2) {
    if (isDragging && dragId) {
      pinNode(sim, dragId, false);
      isDragging = false;
      dragId = null;
    }
    isPanning = false;
    pointerDown = null; // gestul nu mai poate fi click
    const [p1, p2] = [...activePointers.values()];
    pinchStart = {
      dist: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1,
      midX: (p1.x + p2.x) / 2,
      midY: (p1.y + p2.y) / 2,
      zoom,
      viewportX,
      viewportY,
    };
    return;
  }

  const nodeId = findNodeAt(x, y);
  pointerDown = { x, y, time: performance.now(), nodeId };

  if (nodeId) {
    const node = sim.nodes.get(nodeId);
    const world = screenToWorld(x, y);
    isDragging = true;
    dragId = nodeId;
    // Offset-ul se ține în coordonate WORLD — independent de zoom
    dragOffsetX = node.x - world.x;
    dragOffsetY = node.y - world.y;
    pinNode(sim, nodeId, true);
    canvasEl.style.cursor = 'grabbing';
    reheat(sim, 0.6);
  } else {
    // Drag pe spațiu gol = pan al viewport-ului
    isPanning = true;
    lastPanX = x;
    lastPanY = y;
    canvasEl.style.cursor = 'grabbing';
  }
}

function handlePointerMove(e) {
  const { x, y } = pointerToCanvas(e.clientX, e.clientY);

  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x, y });
  }

  // Pinch cu 2 degete: zoom ancorat pe mijlocul inițial + pan cu delta mijlocului
  if (pinchStart && activePointers.size >= 2) {
    const [p1, p2] = [...activePointers.values()];
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStart.zoom * (dist / pinchStart.dist)));
    // Punctul world de sub mijlocul INIȚIAL al pinch-ului rămâne sub mijlocul curent
    const worldMidX = (pinchStart.midX - pinchStart.viewportX) / pinchStart.zoom;
    const worldMidY = (pinchStart.midY - pinchStart.viewportY) / pinchStart.zoom;
    viewportX = midX - worldMidX * nextZoom;
    viewportY = midY - worldMidY * nextZoom;
    zoom = nextZoom;
    targetVX = viewportX;
    targetVY = viewportY;
    return;
  }

  if (isDragging && dragId) {
    const world = screenToWorld(x, y);
    setNodePosition(sim, dragId, world.x + dragOffsetX, world.y + dragOffsetY);
    reheat(sim, 0.3);
    return;
  }

  if (isPanning) {
    viewportX += x - lastPanX;
    viewportY += y - lastPanY;
    targetVX = viewportX;
    targetVY = viewportY;
    lastPanX = x;
    lastPanY = y;
    return;
  }

  const hit = findNodeAt(x, y);
  if (hit !== hoveredId) {
    hoveredId = hit;
    canvasEl.style.cursor = hit ? 'pointer' : 'grab';
  }
}

function handlePointerUp(e) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchStart = null;

  const wasInteractingWithNode = pointerDown && pointerDown.nodeId;

  if (isDragging && dragId) {
    pinNode(sim, dragId, false);
    isDragging = false;
    dragId = null;
    canvasEl.style.cursor = hoveredId ? 'pointer' : 'grab';
    reheat(sim, 0.3);
  }

  if (isPanning) {
    isPanning = false;
    canvasEl.style.cursor = hoveredId ? 'pointer' : 'grab';
  }

  // Detectare click vs drag (pan-ul dincolo de CLICK_DISTANCE_MAX nu deselectează)
  if (wasInteractingWithNode) {
    const { x: x0, y: y0, time, nodeId } = pointerDown;
    const { x: x1, y: y1 } = pointerToCanvas(e.clientX, e.clientY);
    const dx = x1 - x0, dy = y1 - y0;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const elapsed  = performance.now() - time;

    if (distance < CLICK_DISTANCE_MAX && elapsed < CLICK_TIME_MAX) {
      toggleSelect(nodeId);
    }
    pointerDown = null;
  } else if (pointerDown) {
    const { x: x0, y: y0, time } = pointerDown;
    const { x: x1, y: y1 } = pointerToCanvas(e.clientX, e.clientY);
    const distance = Math.hypot(x1 - x0, y1 - y0);
    const elapsed  = performance.now() - time;
    pointerDown = null;

    // Tap scurt pe spațiu gol → deselect + reset soare (pan lung NU deselectează)
    if (distance < CLICK_DISTANCE_MAX && elapsed < CLICK_TIME_MAX && (selectedId || activeTag)) {
      const hadSelection = !!selectedId;
      selectedId = null;
      clearHighlight();
      refreshFromStore();
      if (hadSelection) announce(t.a11y.sunReset);
      notifySelect();
    }
  }
}

function handleKeydown(e) {
  if (spotlightId !== null) return;
  if (e.key === 'Escape') {
    if (selectedId || activeTag) {
      const hadSelection = !!selectedId;
      selectedId = null;
      clearHighlight();
      refreshFromStore(); // fără reheat — soarele e render-only
      if (hadSelection) announce(t.a11y.sunReset);
      notifySelect();
    }
  }
}

/** Setează selecția din afară (sync cu sidebar). Fără reheat — soarele e render-only. */
export function setSelected(id) {
  if (selectedId === id) return;
  selectedId = id;
  refreshFromStore();
}

export function getSelected()  { return selectedId; }

/**
 * Sets the spotlight node for focus mode. Dims all other nodes; pans viewport
 * to center the target node. Pass null to exit spotlight.
 */
export function setSpotlight(id) {
  spotlightId = id;
  clearHighlight(); // focus wins over tag highlight

  if (id) {
    const node = sim && sim.nodes.get(id);
    if (node) {
      const w = getLogicalWidth();
      const h = getLogicalHeight();
      targetVX = w / 2 - node.x * zoom;
      targetVY = h / 2 - node.y * zoom;
    }
  } else {
    targetVX = 0;
    targetVY = 0;
  }
}

export function updateSpotlightTarget(id) {
  if (!id || !sim) return;
  const node = sim.nodes.get(id);
  if (!node) return;
  spotlightId = id;
  const w = getLogicalWidth();
  const h = getLogicalHeight();
  targetVX = w / 2 - node.x * zoom;
  targetVY = h / 2 - node.y * zoom;
}

export function onSelect(fn) {
  selectListeners.add(fn);
  return () => selectListeners.delete(fn);
}

function toggleSelect(id) {
  const wasSelected = selectedId !== null;
  const newId = selectedId === id ? null : id;
  selectedId = newId;
  if (selectedId) clearHighlight();

  // Rebuild adâncimi cu noul override (sau fără dacă deselect). Fără reheat —
  // soarele e un concept de render; fizica nu trebuie perturbată la fiecare click.
  refreshFromStore();

  // Anunțăm direct din canvas: promovare când selectăm, reset când deselectăm.
  // ui.js NU mai anunță pentru events de canvas (ar dubla mesajul).
  if (newId !== null) {
    const note = nodesById.get(newId);
    if (note) {
      // Contextul de graf face canvas-ul (aria-hidden) inteligibil non-vizual:
      // al cui soare e nodul, cu cine e conectat și prin ce tag-uri.
      const graphContext = t.a11y.nodeContext(describeNode(newId, graphModel));
      announce(`${t.a11y.sunPromoted(note.title)} ${graphContext}`);
    }
  } else if (wasSelected) {
    announce(t.a11y.sunReset);
  }

  notifySelect();
}

function notifySelect() {
  for (const fn of selectListeners) {
    try { fn(selectedId); } catch (err) { console.error('[canvas] selectListener:', err); }
  }
}

/**
 * Evidențiază componenta conexă care conține orice nod cu acest tag.
 * Re-click pe același tag → toggle off.
 */
export function highlightByTag(tag) {
  if (spotlightId !== null) return; // focus wins over tag highlight
  if (!tag) { clearHighlight(); return; }
  if (activeTag === tag) { clearHighlight(); return; }

  activeTag = tag;
  const seeds = nodesWithTag([...nodesById.values()], tag);
  const reached = new Set();
  for (const seed of seeds) {
    for (const id of connectedComponent(seed, adjacency)) reached.add(id);
  }
  highlightedIds = reached;
  reheat(sim, 0.2);
}

export function getActiveTag() { return activeTag; }

function clearHighlight() {
  highlightedIds = null;
  activeTag = null;
}

/**
 * Returns the canvas-wrapper-relative CSS pixel position of a node.
 * Used by ui-node-panel.js to anchor the floating panel.
 * Returns null if node is hidden, not in sim, or canvas not mounted.
 */
export function getNodeScreenPosition(id) {
  if (!canvasEl || !sim || hiddenIds.has(id)) return null;
  const node = sim.nodes.get(id);
  if (!node) return null;
  const depth = depths.get(id) ?? 0;
  const r = nodeRadius(childCounts.get(id) ?? 0, depth);
  return { x: node.x * zoom + viewportX, y: node.y * zoom + viewportY, r: r * zoom };
}

/* ─────────────────────────── Zoom API ─────────────────────────── */

/**
 * Zoom centrat pe punctul de ecran (sx, sy) — punctul din world de sub cursor
 * rămâne fix pe ecran. Sincronizează target-urile ca lerp-ul să nu "tragă înapoi".
 */
function zoomAt(sx, sy, factor) {
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
  if (next === zoom) return;
  viewportX = sx - (sx - viewportX) * (next / zoom);
  viewportY = sy - (sy - viewportY) * (next / zoom);
  zoom = next;
  targetVX = viewportX;
  targetVY = viewportY;
}

export function zoomIn()  { zoomAt(getLogicalWidth() / 2, getLogicalHeight() / 2, 1.25); }
export function zoomOut() { zoomAt(getLogicalWidth() / 2, getLogicalHeight() / 2, 1 / 1.25); }

export function resetView() {
  zoom = 1;
  viewportX = 0; viewportY = 0;
  targetVX = 0;  targetVY = 0;
}

export function getZoom() { return zoom; }

function handleWheel(e) {
  if (spotlightId !== null) return; // focus mode controlează viewport-ul
  e.preventDefault(); // canvasul consumă scroll-ul — pagina nu derulează
  const { x, y } = pointerToCanvas(e.clientX, e.clientY);
  zoomAt(x, y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
}
