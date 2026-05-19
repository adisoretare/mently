/**
 * canvas.js — Renderer Canvas + Interaction layer
 * =============================================================================
 * DECIZII ARHITECTURALE (Cap. I, III, IV):
 *
 * 1. SEPARARE LOGICĂ ↔ DESEN
 *    physics.js calculează FĂRĂ să atingă DOM/Canvas.
 *    canvas.js DOAR citește pozițiile și desenează — apoi captează input.
 *    Beneficiu: poți rula simularea într-un Web Worker (rezistent la scale-up).
 *
 * 2. RENDER LOOP cu requestAnimationFrame
 *    rAF se sincronizează cu refresh-ul ecranului → 60fps fără tearing.
 *    Bonus: când tabul e ascuns, browserul oprește automat rAF → 0 CPU usage.
 *
 * 3. HIGH-DPI AWARE
 *    Pixel buffer = CSS size × devicePixelRatio.
 *    ctx.setTransform(dpr, 0, 0, dpr, 0, 0) → desenăm în pixeli logici.
 *    Rezultat: linii crisp pe Retina/4K fără să dublăm complexitatea codului.
 *
 * 4. RETAINED-MODE prin physics.js + IMMEDIATE-MODE prin canvas.js
 *    Pozițiile trăiesc în physics.js (retained), iar canvas.js le desenează
 *    de la zero la fiecare frame (immediate). Hibrid optim pentru graf dinamic.
 *
 * 5. PICKING prin distanță geometrică
 *    Click → caut nodul cu d² < r²·padding. O(n) per click, perfect pentru
 *    n < 10⁴. Nu am nevoie de quadtree pentru această scală.
 *
 * 6. EVENT BUS MINIMAL
 *    `selectListeners` permite ui-list.js să fie notificat când utilizatorul
 *    selectează un nod pe canvas, fără cuplare directă. Mediator pattern.
 *
 * 7. POINTER EVENTS unificate
 *    Mouse + touch printr-un singur handler (Pointer Events API).
 *    Standard W3C, suport universal modern → cod 2x mai scurt decât duplicat.
 * =============================================================================
 */

import { subscribe, getNotes } from './store.js';
import { buildGraphModel, connectedComponent, nodesWithTag } from './graph.js';
import {
  createSimulation,
  syncNodes,
  tick,
  setNodePosition,
  pinNode,
  reheat,
  resize,
} from './physics.js';

/* ─────────────────────────── State ─────────────────────────── */

let canvasEl = null;
let ctx = null;
let sim = null;
let dpr = 1;

// Cache din graph model — refreshed la subscribe
let edges = [];
let adjacency = new Map();
let nodesById = new Map(); // pentru lookup rapid în render

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

/* ─────────────────────────── Paletă (sincron cu CSS vars) ─────────────────────────── */

const PALETTE = {
  ink950: '#0c0a09',
  ink800: '#292524',
  ink700: '#44403c',
  paper100: '#fafaf9',
  paper300: '#d6d3d1',
  paper500: '#a8a29e',
  signal400: '#fb923c',
  signal300: '#fdba74',
};

const NODE_BASE_RADIUS = 6;
const NODE_DEGREE_RADIUS = 1.6; // bonus radius per grad
const NODE_MAX_DEGREE_BONUS = 6;

const CLICK_DISTANCE_MAX = 5;   // px — sub această distanță, e click nu drag
const CLICK_TIME_MAX = 300;     // ms

/* ─────────────────────────── Init ─────────────────────────── */

export function init(canvas) {
  if (!canvas) {
    console.error('[canvas] Element canvas lipsă');
    return;
  }
  canvasEl = canvas;
  ctx = canvas.getContext('2d');

  resizeToContainer();
  sim = createSimulation(getLogicalWidth(), getLogicalHeight());

  refreshFromStore();
  subscribe(refreshFromStore);

  // Pointer Events: unified mouse + touch + pen
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp); // global → catch drag release outside canvas
  canvas.addEventListener('pointercancel', handlePointerUp);

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

/* ─────────────────────────── Sync din store ─────────────────────────── */

function refreshFromStore() {
  const notes = getNotes();
  const model = buildGraphModel(notes);

  edges = model.edges;
  adjacency = model.adjacency;
  nodesById = new Map(notes.map((n) => [n.id, n]));

  if (sim) syncNodes(sim, notes);

  // Dacă tag-ul activ a devenit invalid, curăță highlight-ul
  if (activeTag) {
    const stillExists = notes.some((n) => n.tags.includes(activeTag));
    if (!stillExists) clearHighlight();
  }
}

/* ─────────────────────────── Render loop ─────────────────────────── */

function loop() {
  // Sari tick + render când tab-ul e ascuns (browser throttlează rAF, dar economisim și mai mult)
  if (!document.hidden) {
    if (sim.nodes.size > 0) tick(sim, edges);
    render();
  }
  requestAnimationFrame(loop);
}

/* ─────────────────────────── Render ─────────────────────────── */

function render() {
  const w = getLogicalWidth();
  const h = getLogicalHeight();

  // Clear pe transparent → texturile bg-grain + vignette din spate se văd
  ctx.clearRect(0, 0, w, h);

  const hasHighlight = highlightedIds !== null;

  // 1. Edges (sub noduri)
  for (const edge of edges) {
    const A = sim.nodes.get(edge.source);
    const B = sim.nodes.get(edge.target);
    if (!A || !B) continue;

    const isActive = !hasHighlight || (highlightedIds.has(edge.source) && highlightedIds.has(edge.target));
    const touchesSelected = selectedId && (edge.source === selectedId || edge.target === selectedId);
    const touchesHovered = hoveredId && (edge.source === hoveredId || edge.target === hoveredId);

    let color, alpha, lineWidth;
    if (touchesSelected) {
      color = PALETTE.signal400;
      alpha = 0.9;
      lineWidth = Math.min(1 + edge.weight * 0.6, 3.5);
    } else if (touchesHovered) {
      color = PALETTE.signal300;
      alpha = 0.7;
      lineWidth = Math.min(0.8 + edge.weight * 0.5, 3);
    } else if (isActive) {
      color = PALETTE.ink700;
      alpha = 0.7;
      lineWidth = Math.min(0.5 + edge.weight * 0.4, 2.5);
    } else {
      color = PALETTE.ink800;
      alpha = 0.15;
      lineWidth = 0.5;
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

  // 2. Nodes
  for (const [id, note] of nodesById) {
    const node = sim.nodes.get(id);
    if (!node) continue;

    const degree = (adjacency.get(id) || new Set()).size;
    const radius = NODE_BASE_RADIUS + Math.min(degree, NODE_MAX_DEGREE_BONUS) * NODE_DEGREE_RADIUS;

    const isSelected = id === selectedId;
    const isHovered = id === hoveredId;
    const isHighlighted = hasHighlight && highlightedIds.has(id);
    const isInactive = hasHighlight && !isHighlighted;

    ctx.globalAlpha = isInactive ? 0.25 : 1;

    // Glow halo pentru nodul selectat
    if (isSelected) {
      const glowRadius = radius + 12;
      const gradient = ctx.createRadialGradient(node.x, node.y, radius * 0.8, node.x, node.y, glowRadius);
      gradient.addColorStop(0, 'rgba(251, 146, 60, 0.5)');
      gradient.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fill
    let fillColor;
    if (isSelected) fillColor = PALETTE.signal400;
    else if (isHovered) fillColor = PALETTE.signal300;
    else if (isHighlighted) fillColor = PALETTE.signal400;
    else fillColor = PALETTE.paper500;

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Ring (separation de fundal)
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = PALETTE.ink950;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label
    const showProminentLabel = isSelected || isHovered;
    const showLabel = showProminentLabel || isHighlighted || degree > 1;

    if (showLabel) {
      ctx.font = showProminentLabel ? '500 12px Geist, sans-serif' : '11px Geist, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const maxLen = showProminentLabel ? 32 : 24;
      const label = note.title.length > maxLen ? note.title.slice(0, maxLen) + '…' : note.title;
      const labelY = node.y + radius + 6;

      // Pill background pentru labels prominent — îmbunătățește lizibilitatea peste edges
      if (showProminentLabel) {
        const metrics = ctx.measureText(label);
        const padX = 6;
        const padY = 3;
        ctx.fillStyle = 'rgba(12, 10, 9, 0.88)';
        ctx.beginPath();
        roundRect(ctx, node.x - metrics.width / 2 - padX, labelY - padY + 1, metrics.width + padX * 2, 14 + padY * 2, 3);
        ctx.fill();
        ctx.fillStyle = PALETTE.paper100;
      } else {
        ctx.fillStyle = PALETTE.paper500;
      }

      ctx.fillText(label, node.x, labelY);
    }
  }
  ctx.globalAlpha = 1;
}

/** Mic helper pentru pill labels. */
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

/* ─────────────────────────── Geometry / Picking ─────────────────────────── */

function getLogicalWidth() {
  return canvasEl.width / dpr;
}
function getLogicalHeight() {
  return canvasEl.height / dpr;
}

function resizeToContainer() {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  dpr = window.devicePixelRatio || 1;
  canvasEl.width = Math.round(rect.width * dpr);
  canvasEl.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (sim) resize(sim, rect.width, rect.height);
}

/** Mouse client coords → canvas logical coords. */
function pointerToCanvas(clientX, clientY) {
  const rect = canvasEl.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/** Picking: returnează id-ul nodului sub punctul (x, y) sau null. */
function findNodeAt(x, y) {
  let best = null;
  let bestDist2 = Infinity;
  for (const [id] of nodesById) {
    const node = sim.nodes.get(id);
    if (!node) continue;
    const degree = (adjacency.get(id) || new Set()).size;
    const radius = NODE_BASE_RADIUS + Math.min(degree, NODE_MAX_DEGREE_BONUS) * NODE_DEGREE_RADIUS;
    const dx = x - node.x;
    const dy = y - node.y;
    const dist2 = dx * dx + dy * dy;
    const hitRadius = radius + 4; // mic padding pentru click confort
    if (dist2 <= hitRadius * hitRadius && dist2 < bestDist2) {
      best = id;
      bestDist2 = dist2;
    }
  }
  return best;
}

/* ─────────────────────────── Pointer events ─────────────────────────── */

function handlePointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return; // doar left click
  canvasEl.setPointerCapture?.(e.pointerId);

  const { x, y } = pointerToCanvas(e.clientX, e.clientY);
  const nodeId = findNodeAt(x, y);
  pointerDown = { x, y, time: performance.now(), nodeId };

  if (nodeId) {
    const node = sim.nodes.get(nodeId);
    isDragging = true;
    dragId = nodeId;
    dragOffsetX = node.x - x;
    dragOffsetY = node.y - y;
    pinNode(sim, nodeId, true);
    canvasEl.style.cursor = 'grabbing';
    reheat(sim, 0.6); // trezește simularea
  }
}

function handlePointerMove(e) {
  const { x, y } = pointerToCanvas(e.clientX, e.clientY);

  if (isDragging && dragId) {
    setNodePosition(sim, dragId, x + dragOffsetX, y + dragOffsetY);
    reheat(sim, 0.3); // menține simularea trează cât e drag activ
    return;
  }

  const hit = findNodeAt(x, y);
  if (hit !== hoveredId) {
    hoveredId = hit;
    canvasEl.style.cursor = hit ? 'pointer' : 'grab';
  }
}

function handlePointerUp(e) {
  const wasInteractingWithNode = pointerDown && pointerDown.nodeId;

  if (isDragging && dragId) {
    pinNode(sim, dragId, false);
    isDragging = false;
    dragId = null;
    canvasEl.style.cursor = hoveredId ? 'pointer' : 'grab';
    reheat(sim, 0.3);
  }

  // Detectare click vs drag
  if (wasInteractingWithNode) {
    const { x: x0, y: y0, time, nodeId } = pointerDown;
    const { x: x1, y: y1 } = pointerToCanvas(e.clientX, e.clientY);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const elapsed = performance.now() - time;

    if (distance < CLICK_DISTANCE_MAX && elapsed < CLICK_TIME_MAX) {
      toggleSelect(nodeId);
    }
  } else if (pointerDown) {
    // Click pe spațiu gol → deselect
    if (selectedId || activeTag) {
      selectedId = null;
      clearHighlight();
      notifySelect();
    }
  }

  pointerDown = null;
}

/* ─────────────────────────── Keyboard ─────────────────────────── */

function handleKeydown(e) {
  if (e.key === 'Escape') {
    if (selectedId || activeTag) {
      selectedId = null;
      clearHighlight();
      notifySelect();
    }
  }
}

/* ─────────────────────────── Public selection API ─────────────────────────── */

/** Setează selecția din afară (sync cu sidebar). */
export function setSelected(id) {
  if (selectedId === id) return;
  selectedId = id;
  reheat(sim, 0.2);
}

export function getSelected() {
  return selectedId;
}

export function onSelect(fn) {
  selectListeners.add(fn);
  return () => selectListeners.delete(fn);
}

function toggleSelect(id) {
  selectedId = selectedId === id ? null : id;
  // Click pe nod ≠ tag highlight → resetăm highlight-ul când selectăm un nod
  if (selectedId) clearHighlight();
  reheat(sim, 0.2);
  notifySelect();
}

function notifySelect() {
  for (const fn of selectListeners) {
    try { fn(selectedId); } catch (err) { console.error('[canvas] selectListener:', err); }
  }
}

/* ─────────────────────────── Tag highlight ─────────────────────────── */

/**
 * Evidențiază componenta conexă care conține orice nod cu acest tag.
 * Re-click pe același tag → toggle off.
 */
export function highlightByTag(tag) {
  if (!tag) {
    clearHighlight();
    return;
  }
  if (activeTag === tag) {
    // Toggle off
    clearHighlight();
    return;
  }
  activeTag = tag;
  const seeds = nodesWithTag([...nodesById.values()], tag);
  const reached = new Set();
  for (const seed of seeds) {
    for (const id of connectedComponent(seed, adjacency)) {
      reached.add(id);
    }
  }
  highlightedIds = reached;
  reheat(sim, 0.2);
}

export function getActiveTag() {
  return activeTag;
}

function clearHighlight() {
  highlightedIds = null;
  activeTag = null;
}
