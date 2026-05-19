/**
 * ui.js — Orchestrator UI (Composition / Mediator)
 * =============================================================================
 * Compune componentele: Form, List, Drawer, Canvas + stats.
 * Wire-uiește:
 *   - selecția bidirecțională sidebar ↔ canvas
 *   - tag filter (card → graf highlight)
 *   - EDIT flow: list emite onEdit → form intră în edit mode + canvas selectează
 *
 * PATTERN: Mediator. ui.js cunoaște componentele; ele NU se cunosc între ele.
 * =============================================================================
 */

import { subscribe, getNotes, getNoteById } from './store.js';
import { buildGraphModel } from './graph.js';
import { setAriaLive, announce } from './dom.js';
import { escapeHtml } from './security.js';
import { t } from './i18n.js';
import * as Form from './ui-form.js';
import * as List from './ui-list.js';
import * as Drawer from './ui-drawer.js';
import * as Canvas from './canvas.js';

let sidebarEl = null;
let canvasEl = null;
let placeholderEl = null;
let statsEl = null;

/* ─────────────────────────── Public API ─────────────────────────── */

export function init() {
  sidebarEl     = document.getElementById('sidebar');
  canvasEl      = document.getElementById('graph-canvas');
  placeholderEl = document.getElementById('canvas-placeholder');

  const ariaLive = document.getElementById('aria-live');
  setAriaLive(ariaLive);

  if (!sidebarEl || !canvasEl) {
    console.error('[ui] Elemente DOM lipsă — verifică index.html');
    return;
  }

  sidebarEl.innerHTML = renderSidebarShell();

  Form.mount(sidebarEl.querySelector('#form-section'));
  List.mount(sidebarEl.querySelector('#list-section'));
  statsEl = sidebarEl.querySelector('#stats-section');
  Drawer.init();
  Canvas.init(canvasEl);

  // ─── Selection sync sidebar ↔ canvas ───
  List.onSelect((id) => {
    Canvas.setSelected(id);
    if (id) {
      const note = getNoteById(id);
      if (note) announce(t.a11y.nodeSelected(note.title));
    }
  });
  Canvas.onSelect((id) => {
    List.setSelectedId(id);
    if (!id) announce(t.a11y.selectionCleared);
  });

  // ─── Tag click sidebar → highlight componentă ───
  List.onTagClick((tag) => {
    Canvas.highlightByTag(tag);
  });

  // ─── EDIT flow: list → form (cu selecție auto pe canvas) ───
  List.onEdit((id) => {
    Form.enterEditMode(id);
    Canvas.setSelected(id);
    List.setSelectedId(id);
  });

  subscribe(handleStateChange);
  handleStateChange();
}

export { announce };

/* ─────────────────────────── Sidebar shell ─────────────────────────── */

function renderSidebarShell() {
  return `
    <div class="h-full flex flex-col animate-fade-up">
      <header class="flex items-start justify-between px-7 pt-8 pb-5 flex-shrink-0">
        <div>
          <h1 class="font-display italic text-5xl leading-none tracking-tight">
            ${escapeHtml(t.brand)}<span class="text-signal-400">.</span>
          </h1>
          <p class="mt-2 text-[10px] uppercase tracking-[0.22em] text-paper-500/80">
            ${escapeHtml(t.tagline)}
          </p>
        </div>
        <button
          id="drawer-close"
          type="button"
          class="md:hidden p-1.5 -mt-1 -mr-1 text-paper-500 hover:text-paper-100 rounded transition-colors"
          aria-label="${escapeHtml(t.drawer.close)}"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <div id="stats-section" class="px-7 pb-5 flex-shrink-0" aria-label="Statistici graf"></div>

      <div class="flex-1 overflow-y-auto mently-scroll px-7 pb-8 space-y-6">
        <section id="form-section" aria-label="Formular notițe"></section>
        <section id="list-section" aria-label="${escapeHtml(t.list.heading)}"></section>
      </div>
    </div>
  `;
}

/* ─────────────────────────── Reactivity ─────────────────────────── */

function handleStateChange() {
  const notes = getNotes();
  const model = buildGraphModel(notes);

  if (statsEl) {
    statsEl.innerHTML = `
      <div class="grid grid-cols-4 gap-1.5">
        ${statCard('Notes', notes.length)}
        ${statCard('Edges', model.edges.length)}
        ${statCard('Tags', model.tagFrequency.length)}
        ${statCard('Cmps', model.components.length)}
      </div>
    `;
  }

  List.render(notes);

  if (placeholderEl) {
    placeholderEl.style.opacity = notes.length === 0 ? '1' : '0';
    placeholderEl.style.transition = 'opacity 0.5s var(--ease-out-soft)';
  }
}

function statCard(label, value) {
  return `
    <div class="bg-ink-900/70 border border-ink-800 rounded-md px-2 py-2 text-center">
      <div class="text-[9px] uppercase tracking-[0.12em] text-paper-500/70">${escapeHtml(label)}</div>
      <div class="font-mono text-base text-paper-100 mt-0.5 tabular-nums">${value}</div>
    </div>
  `;
}