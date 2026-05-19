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

import { subscribe, getNotes, getNoteById, updateNote } from './store.js';
import { buildGraphModel } from './graph.js';
import { setAriaLive, announce } from './dom.js';
import { escapeHtml } from './security.js';
import { t } from './i18n.js';
import * as Form from './ui-form.js';
import * as List from './ui-list.js';
import * as Drawer from './ui-drawer.js';
import * as Canvas from './canvas.js';
import * as NodePanel from './ui-node-panel.js';
import * as Tasks from './ui-tasks.js';
import * as Focus from './focus.js';

let sidebarEl = null;
let canvasEl = null;
let placeholderEl = null;
let statsEl = null;
let cachedModel = null;

/* ─────────────────────────── Public API ─────────────────────────── */

export function init() {
  sidebarEl     = document.getElementById('sidebar');
  canvasEl      = document.getElementById('graph-canvas');
  placeholderEl = document.getElementById('canvas-placeholder');

  const ariaLive = document.getElementById('aria-live');
  setAriaLive(ariaLive);

  // Suprascriem aria-label-urile statice din index.html cu valorile din i18n.
  // index.html are fallback-uri hardcodate pentru cazul fără JS; ui.js le înlocuiește
  // imediat ce pornește ca să i18n.js rămână singura sursă de adevăr pentru texte.
  const appEl = document.getElementById('app');
  if (appEl) appEl.setAttribute('aria-label', t.a11y.appLabel);
  if (sidebarEl) sidebarEl.setAttribute('aria-label', t.a11y.sidebarRegion);
  const canvasWrapperEl = document.getElementById('canvas-wrapper');
  if (canvasWrapperEl) canvasWrapperEl.setAttribute('aria-label', t.a11y.canvasRegion);
  const drawerOpenBtn = document.getElementById('drawer-open');
  if (drawerOpenBtn) drawerOpenBtn.setAttribute('aria-label', t.drawer.open);

  if (!sidebarEl || !canvasEl) {
    console.error('[ui] Elemente DOM lipsă — verifică index.html');
    return;
  }

  sidebarEl.innerHTML = renderSidebarShell();

  Form.mount(sidebarEl.querySelector('#form-section'));
  List.mount(sidebarEl.querySelector('#list-section'));
  Tasks.mount(sidebarEl.querySelector('#tasks-section'), {
    onSelect: (id) => {
      Canvas.setSelected(id);
      List.setSelectedId(id);
      Tasks.setSelectedId(id);
      id ? NodePanel.show(id) : NodePanel.hide();
      if (id) {
        const note = getNoteById(id);
        if (note) announce(t.a11y.nodeSelected(note.title));
      }
    },
    onEdit: (id) => {
      Form.enterEditMode(id);
      Canvas.setSelected(id);
      List.setSelectedId(id);
      Tasks.setSelectedId(id);
    },
  });
  statsEl = sidebarEl.querySelector('#stats-section');
  Drawer.init();
  Canvas.init(canvasEl);

  NodePanel.mount(document.getElementById('canvas-wrapper'), {
    getScreenPos: Canvas.getNodeScreenPosition,
    onFocus: (id) => Focus.start(id),
    onEdit: (id) => {
      Form.enterEditMode(id);
      Canvas.setSelected(id);
      List.setSelectedId(id);
    },
    onSetSun: (id) => {
      if (!cachedModel) return;
      const compIdx = cachedModel.componentIndexById.get(id);
      if (compIdx === undefined) return;
      const comp = cachedModel.components[compIdx];
      for (const note of getNotes()) {
        if (note.isSun && comp.has(note.id) && note.id !== id) {
          updateNote(note.id, { isSun: false });
        }
      }
      updateNote(id, { isSun: true });
    },
  });

  // ─── Selection sync sidebar ↔ canvas ───
  List.onSelect((id) => {
    Canvas.setSelected(id);
    Tasks.setSelectedId(id);
    id ? NodePanel.show(id) : NodePanel.hide();
    if (id) {
      const note = getNoteById(id);
      if (note) announce(t.a11y.nodeSelected(note.title));
    }
  });
  Canvas.onSelect((id) => {
    // Canvas are responsabilitatea anunțurilor pentru evenimentele de pe canvas
    // (sunPromoted / sunReset). ui.js anunță doar pentru selecțiile din sidebar.
    List.setSelectedId(id);
    Tasks.setSelectedId(id);
    id ? NodePanel.show(id) : NodePanel.hide();
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
    Tasks.setSelectedId(id);
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
          <!-- Gradient text: alb curat → ușor cald — mai multă personalitate fără să rupă paleta -->
          <h1 class="font-display italic text-5xl leading-none tracking-tight select-none">
            <span style="background:linear-gradient(to bottom right,var(--c-paper-100),var(--c-paper-300));-webkit-background-clip:text;background-clip:text;color:transparent">
              ${escapeHtml(t.brand)}
            </span><span class="text-signal-400">.</span>
          </h1>
          <p class="mt-2 text-[10px] uppercase tracking-[0.26em] text-paper-500/60">
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

      <div id="stats-section" class="px-7 pb-5 flex-shrink-0" aria-label="${escapeHtml(t.a11y.statsRegion)}"></div>

      <div class="flex-1 overflow-y-auto mently-scroll px-7 pb-8 space-y-6">
        <section id="tasks-section" aria-labelledby="tasks-heading"></section>
        <section id="form-section" aria-label="${escapeHtml(t.a11y.formRegion)}"></section>
        <section id="list-section" aria-label="${escapeHtml(t.list.heading)}"></section>
      </div>
    </div>
  `;
}

/* ─────────────────────────── Reactivity ─────────────────────────── */

function handleStateChange() {
  const notes = getNotes();
  const model = buildGraphModel(notes);
  cachedModel = model;

  if (statsEl) {
    statsEl.innerHTML = `
      <div class="grid grid-cols-4 gap-1.5">
        ${statCard(t.stats.nodes, notes.length)}
        ${statCard(t.stats.edges, model.edges.length)}
        ${statCard(t.stats.tags, model.tagFrequency.length)}
        ${statCard(t.stats.components, model.components.length)}
      </div>
    `;
  }

  List.render(notes);
  Tasks.render(notes);

  if (placeholderEl) {
    placeholderEl.style.opacity = notes.length === 0 ? '1' : '0';
    placeholderEl.style.transition = 'opacity 0.5s var(--ease-out-soft)';
  }
}

function statCard(label, value) {
  return `
    <div class="relative bg-ink-900/60 border border-ink-800 rounded-xl px-2 py-2.5 text-center overflow-hidden group hover:border-ink-700 transition-colors cursor-default">
      <!-- Linie de accent subtilă în partea de sus — sugerează că cardul e "activ" -->
      <div class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-signal-400/25 to-transparent"></div>
      <div class="text-[9px] uppercase tracking-[0.14em] text-paper-500/60 group-hover:text-paper-500/80 transition-colors">${escapeHtml(label)}</div>
      <div class="font-mono text-lg text-paper-100 mt-0.5 tabular-nums leading-none">${value}</div>
    </div>
  `;
}