/**
 * focus.js — Focus mode: step-through traversal of a node's BFS subtree
 */

import { getNotes, getNoteById, subscribe } from './store.js';
import { buildGraphModel } from './graph.js';
import { announce } from './dom.js';
import { escapeHtml } from './security.js';
import { t } from './i18n.js';
import * as Canvas from './canvas.js';

/* ─── State ─── */

let active = false;
let steps = [];       // ordered array of note ids (leaves-first, target last)
let stepIndex = 0;    // current step (0-based)
let targetId = null;
let storeUnsub = null;
let preFocusSelectedId = null; // Fix 1: restore pre-focus selection on exit

let barEl = null;          // the #focus-bar DOM element (lazily created)
let canvasWrapper = null;  // set via init()

/* ─── Public API ─── */

export function init(wrapperEl) {
  if (canvasWrapper) return; // Fix 3: guard against double-init
  canvasWrapper = wrapperEl;

  window.addEventListener('keydown', (e) => {
    // Guard: ignore when typing in inputs
    if (e.target.matches('input,textarea,[contenteditable],select')) return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

    if (!active) {
      if (e.key === 'f' || e.key === 'F') {
        const id = Canvas.getSelected();
        if (id) start(id);
      }
      return;
    }

    // Active focus mode keyboard nav
    if (e.key === 'Escape') { exit(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); return; }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); prev(); return; }
  });
}

export function start(id) {
  if (!id) return;
  const notes = getNotes();
  const noteObj = getNoteById(id);
  if (!noteObj) return;

  preFocusSelectedId = Canvas.getSelected(); // Fix 1: capture selection before overriding
  targetId = id;
  steps = computeSteps(id, notes);
  stepIndex = 0;
  active = true;

  // Subscribe to store changes during focus
  if (storeUnsub) storeUnsub();
  storeUnsub = subscribe(() => handleStoreChange());

  applyStep();
  showBar();
  announce(t.a11y.focusStarted(noteObj.title));
}

export function next() {
  if (!active || stepIndex >= steps.length - 1) return;
  stepIndex++;
  applyStep();
}

export function prev() {
  if (!active || stepIndex <= 0) return;
  stepIndex--;
  applyStep();
}

export function exit() {
  if (!active) return;
  active = false;
  steps = [];
  stepIndex = 0;
  targetId = null;

  if (storeUnsub) { storeUnsub(); storeUnsub = null; }

  Canvas.setSpotlight(null);
  // Fix 1: restore selection that was active before focus mode started
  Canvas.setSelected(preFocusSelectedId);
  preFocusSelectedId = null;

  hideBar();
  announce(t.a11y.focusExited);
}

export function isActive() { return active; }

/* ─── Step computation ─── */

function computeSteps(id, notes) {
  // Use the real (non-overridden) BFS tree so DFS only visits id's actual subtree
  const model = buildGraphModel(notes);

  // Find which component contains our target
  const compIdx = model.componentIndexById.get(id);
  if (compIdx === undefined) return [id]; // isolated — no component found

  const comp = model.components[compIdx]; // Set<string>

  // Build children map by inverting bfsParent within the component
  const children = new Map();
  for (const nodeId of comp) {
    if (!children.has(nodeId)) children.set(nodeId, []);
    const parent = model.bfsParent.get(nodeId);
    if (parent !== null && parent !== undefined) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(nodeId);
    }
  }

  // Build a lookup for title sort
  const notesById = new Map(notes.map((n) => [n.id, n]));

  // Iterative post-order DFS (children before parent, children sorted by title)
  const result = [];
  const stack = [[id, false]]; // [nodeId, childrenPushed]

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const frameId = frame[0];
    const childrenPushed = frame[1];

    if (!childrenPushed) {
      frame[1] = true; // mark children pushed on the SAME frame (in place)
      const kids = (children.get(frameId) ?? [])
        .slice()
        .sort((a, b) => {
          const na = notesById.get(a);
          const nb = notesById.get(b);
          return (na?.title ?? '').localeCompare(nb?.title ?? '');
        });
      // Push children in reverse order so first child is processed first
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push([kids[i], false]);
      }
    } else {
      stack.pop();
      result.push(frameId);
    }
  }

  // Filter out hidden nodes (collapsed ancestor) — visiting invisible nodes is confusing
  return result.filter((nodeId) => !model.hiddenIds.has(nodeId));
}

/* ─── Step application ─── */

function applyStep() {
  if (!active || steps.length === 0) return;
  const id = steps[stepIndex];
  Canvas.setSpotlight(id);
  Canvas.setSelected(id);

  const note = getNoteById(id);
  if (note) announce(t.a11y.focusStep(stepIndex + 1, steps.length, note.title));

  updateBar();
}

/* ─── Store change handler ─── */

function handleStoreChange() {
  if (!active) return;
  const notes = getNotes();

  // If target note deleted, exit
  if (!getNoteById(targetId)) { exit(); return; }

  // Fix 2: recompute steps from scratch so new edges/tags are reflected
  const newSteps = computeSteps(targetId, notes);
  if (newSteps.length === 0) { exit(); return; }

  // Try to keep user at the same note; if gone, clamp to end
  const currentStepId = steps[stepIndex];
  const newIdx = newSteps.indexOf(currentStepId);
  steps = newSteps;
  stepIndex = newIdx >= 0 ? newIdx : Math.min(stepIndex, steps.length - 1);
  applyStep();
}

/* ─── Bar DOM ─── */

function ensureBar() {
  if (barEl) return barEl;
  if (!canvasWrapper) return null;

  barEl = document.createElement('div');
  barEl.id = 'focus-bar';
  barEl.setAttribute('role', 'region');
  barEl.setAttribute('aria-live', 'off'); // aria-live is on the step body, not the bar
  canvasWrapper.appendChild(barEl);

  barEl.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'focus-prev') prev();
    else if (action === 'focus-next') next();
    else if (action === 'focus-exit') exit();
  });

  return barEl;
}

function showBar() {
  const bar = ensureBar();
  if (!bar) return;
  bar.style.display = 'flex';
  updateBar();
}

function hideBar() {
  if (!barEl) return;
  barEl.style.display = 'none';
  barEl.innerHTML = '';
}

function updateBar() {
  const bar = ensureBar();
  if (!bar || !active || steps.length === 0) return;

  const id = steps[stepIndex];
  const note = getNoteById(id);
  const title = note ? escapeHtml(note.title) : escapeHtml(t.focus.unavailable);

  const isFirst = stepIndex === 0;
  const isLast  = stepIndex === steps.length - 1;
  const isOnly  = steps.length === 1;

  const stepText = escapeHtml(t.focus.stepLabel(stepIndex + 1, steps.length));
  const hintText = isOnly ? `<span class="focus-bar-hint">${escapeHtml(t.focus.noPrereq)}</span>` : '';

  bar.innerHTML = `
    <button
      class="focus-bar-nav"
      data-action="focus-prev"
      aria-label="${escapeHtml(t.focus.prev)}"
      ${isFirst ? 'disabled' : ''}
    >‹</button>
    <div class="focus-bar-body" aria-live="polite" aria-atomic="true">
      <span class="focus-bar-step">${stepText}</span>
      <strong class="focus-bar-title">${title}</strong>
      ${hintText}
    </div>
    <button
      class="focus-bar-nav"
      data-action="focus-next"
      aria-label="${escapeHtml(t.focus.next)}"
      ${isLast ? 'disabled' : ''}
    >›</button>
    <button
      class="focus-bar-exit"
      data-action="focus-exit"
      aria-label="${escapeHtml(t.focus.exit)}"
    >${escapeHtml(t.focus.exit)}</button>
  `;
}
