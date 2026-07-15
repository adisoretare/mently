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

import { subscribe, getNotes, getNoteById, updateNote, undo, redo, canUndo, canRedo } from './store.js';
import { buildGraphModel, describeNode } from './graph.js';
import { setAriaLive, announce } from './dom.js';
import { escapeHtml } from './security.js';
import { t, setLanguage, getCurrentLanguage } from './i18n.js';
import * as Form from './ui-form.js';
import * as List from './ui-list.js';
import * as Drawer from './ui-drawer.js';
import * as Canvas from './canvas.js';
import * as Hash from './url-hash.js';

import * as NodePanel from './ui-node-panel.js';
import * as Tasks from './ui-tasks.js';
import * as Focus from './focus.js';

let sidebarEl = null;
let canvasEl = null;
let placeholderEl = null;
let statsEl = null;
let cachedModel = null;

/* ─────────────────────────── API public ─────────────────────────── */

/**
 * Punctul de intrare al UI-ului: montează toate componentele, leagă
 * callback-urile între ele (rolul de mediator) și se abonează la store.
 * Apelat o singură dată, din main.js, după încărcarea paginii.
 */
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
        if (note) announce(`${t.a11y.nodeSelected(note.title)} ${nodeContextText(id)}`);
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

  // ─── Sincronizarea selecției sidebar ↔ canvas ───
  // Selecția merge în ambele sensuri: click în listă selectează pe canvas
  // și invers — dar mereu prin ui.js, niciodată direct între componente.
  List.onSelect((id) => {
    Canvas.setSelected(id);
    Tasks.setSelectedId(id);
    id ? NodePanel.show(id) : NodePanel.hide();
    Hash.setNodeHash(id); // reflectăm selecția în URL — hash-ul e „adresa” stării curente
    if (id) {
      const note = getNoteById(id);
      if (note) announce(`${t.a11y.nodeSelected(note.title)} ${nodeContextText(id)}`);
    }
  });
  Canvas.onSelect((id) => {
    // Canvas are responsabilitatea anunțurilor pentru evenimentele de pe canvas
    // (sunPromoted / sunReset). ui.js anunță doar pentru selecțiile din sidebar.
    List.setSelectedId(id);
    Tasks.setSelectedId(id);
    if (!Focus.isActive()) {
      id ? NodePanel.show(id) : NodePanel.hide();
    }
    Hash.setNodeHash(id);
  });

  // ─── Tag click sidebar → highlight componentă ───
  List.onTagClick((tag) => {
    Canvas.highlightByTag(tag);
    Hash.setTagHash(tag);
  });

  // ─── EDIT flow: list → form (cu selecție auto pe canvas) ───
  List.onEdit((id) => {
    Form.enterEditMode(id);
    Canvas.setSelected(id);
    List.setSelectedId(id);
    Tasks.setSelectedId(id);
  });

  initSidebarToggle();
  initLangThemeToolbar();
  initUndoRedo();
  initZoomControls();

  subscribe(handleStateChange);
  handleStateChange();
}

/* ─────────────────────────── Undo / Redo ─────────────────────────── */

function initUndoRedo() {
  const undoBtn = sidebarEl.querySelector('#undo-btn');
  const redoBtn = sidebarEl.querySelector('#redo-btn');

  const doUndo = () => { if (undo()) announce(t.history.undone); };
  const doRedo = () => { if (redo()) announce(t.history.redone); };

  undoBtn?.addEventListener('click', doUndo);
  redoBtn?.addEventListener('click', doRedo);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — dar NU în câmpuri text (acolo rămâne
  // undo-ul nativ al browserului pentru editarea de text).
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); doRedo(); }
  });
}

/** Context de graf pentru anunțuri (screen readers) — canvas-ul e aria-hidden. */
function nodeContextText(id) {
  if (!cachedModel) return '';
  return t.a11y.nodeContext(describeNode(id, cachedModel));
}

/* ─────────────────────────── Controale de zoom ─────────────────────────── */

function initZoomControls() {
  const zin  = document.getElementById('zoom-in');
  const zout = document.getElementById('zoom-out');
  const zres = document.getElementById('zoom-reset');
  if (zin)  { zin.setAttribute('aria-label', t.zoomCtrl.zoomIn);   zin.addEventListener('click', () => Canvas.zoomIn()); }
  if (zout) { zout.setAttribute('aria-label', t.zoomCtrl.zoomOut); zout.addEventListener('click', () => Canvas.zoomOut()); }
  if (zres) { zres.setAttribute('aria-label', t.zoomCtrl.reset);   zres.addEventListener('click', () => Canvas.resetView()); }
}

function syncUndoRedoButtons() {
  const undoBtn = sidebarEl?.querySelector('#undo-btn');
  const redoBtn = sidebarEl?.querySelector('#redo-btn');
  if (undoBtn) undoBtn.disabled = !canUndo();
  if (redoBtn) redoBtn.disabled = !canRedo();
}

/* ─────────────────── Plierea sidebar-ului (doar pe desktop) ─────────────────── */

const SIDEBAR_KEY = 'mently:sidebar-collapsed';

function initSidebarToggle() {
  const btn = document.getElementById('sidebar-toggle');
  if (!btn) return;

  // Sincronizăm eticheta din i18n și restaurăm starea salvată în localStorage
  if (localStorage.getItem(SIDEBAR_KEY) === '1') {
    setCollapsed(btn, true, false);
  } else {
    btn.setAttribute('aria-label', t.sidebar.collapse);
  }

  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.contains('sidebar-collapsed');
    setCollapsed(btn, !collapsed, true);
  });
}

function setCollapsed(btn, collapse, shouldAnnounce) {
  document.body.classList.toggle('sidebar-collapsed', collapse);
  btn.setAttribute('aria-expanded', collapse ? 'false' : 'true');
  btn.setAttribute('aria-label', collapse ? t.sidebar.expand : t.sidebar.collapse);

  const iconCollapse = btn.querySelector('[data-icon="collapse"]');
  const iconExpand   = btn.querySelector('[data-icon="expand"]');
  if (iconCollapse) iconCollapse.style.display = collapse ? 'none' : '';
  if (iconExpand)   iconExpand.style.display   = collapse ? ''     : 'none';

  localStorage.setItem(SIDEBAR_KEY, collapse ? '1' : '0');
  if (shouldAnnounce) announce(collapse ? t.a11y.sidebarCollapsed : t.a11y.sidebarExpanded);

  // Declanșăm manual un resize pentru canvas — schimbarea la display:none
  // nu emite window.resize, deci canvasul n-ar afla că are alt spațiu disponibil
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

// Re-exportăm announce din dom.js — modulele care importă deja ui.js
// nu mai au nevoie de un import separat pentru anunțuri
export { announce };

/* ─────────────────────────── Toolbar limbă + temă ─────────────────────────── */

const THEME_KEY = 'mently:theme';

function initLangThemeToolbar() {
  const langBtn  = document.getElementById('lang-toggle');
  const themeBtn = document.getElementById('theme-toggle');

  if (langBtn) {
    langBtn.addEventListener('click', () => {
      const next = getCurrentLanguage() === 'ro' ? 'en' : 'ro';
      setLanguage(next);
    });
  }

  if (themeBtn) {
    // Aplicăm la încărcare tema salvată în localStorage (implicit: dark)
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved, false);

    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark', true);
    });
  }
}

function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) localStorage.setItem(THEME_KEY, theme);
  // Recitim variabilele CSS ca desenul de pe canvas să preia culorile noii teme
  // (canvasul pictează cu valori citite din CSS, nu se recolorează singur)
  requestAnimationFrame(() => Canvas.reloadPalette());
}

/* ─────────────────────────── Scheletul sidebar-ului ─────────────────────────── */

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
        <div class="flex flex-col items-end gap-2">
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
          <div class="mently-toolbar" aria-label="Display settings">
            <button id="undo-btn" class="mently-toolbar-btn" aria-label="${escapeHtml(t.history.undoLabel)}" disabled>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>
            <button id="redo-btn" class="mently-toolbar-btn" aria-label="${escapeHtml(t.history.redoLabel)}" disabled>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
              </svg>
            </button>
            <button id="lang-toggle" class="mently-toolbar-btn" aria-label="${escapeHtml(t.lang.switchLabel)}">${escapeHtml(t.lang.switchTo)}</button>
            <button id="theme-toggle" class="mently-toolbar-btn" aria-label="${escapeHtml(t.theme.toggleLabel)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            </button>
          </div>
        </div>
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

/* ─────────────────────────── Reactivitate ─────────────────────────── */

// Rulează la fiecare mutație din store: recalculează modelul grafului
// și re-randează statistici, listă, taskuri și rezumatul accesibil.
function handleStateChange() {
  const notes = getNotes();
  const model = buildGraphModel(notes);
  cachedModel = model;

  syncUndoRedoButtons();
  renderGraphSummary(model, notes);

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
    const isEmpty = notes.length === 0;
    placeholderEl.style.opacity = isEmpty ? '1' : '0';
    placeholderEl.style.transition = 'opacity 0.5s var(--ease-out-soft)';
    placeholderEl.setAttribute('aria-hidden', isEmpty ? 'false' : 'true');
    // Ținem textul placeholder-ului în sincron cu limba activă
    const h = placeholderEl.querySelector('p:first-child');
    const p = placeholderEl.querySelector('p:last-child');
    if (h) h.textContent = t.meta.blank;
    if (p) p.textContent = t.meta.blankHint;
  }
}

/**
 * Rezumat non-vizual al structurii grafului pentru screen readers.
 * Canvas-ul e aria-hidden (pixeli, nu semantică) — acest <ul> ascuns vizual e
 * reprezentarea lui accesibilă: fiecare grup cu mărimea și soarele lui.
 * Re-randat doar la mutații de store (ieftin), nu per-frame.
 */
function renderGraphSummary(model, notes) {
  const wrapper = document.getElementById('canvas-wrapper');
  if (!wrapper) return;

  let el = document.getElementById('graph-summary');
  if (!el) {
    el = document.createElement('div');
    el.id = 'graph-summary';
    el.className = 'sr-only';
    wrapper.appendChild(el);
  }
  el.setAttribute('aria-label', t.a11y.graphSummaryLabel);

  const titleById = new Map(notes.map((n) => [n.id, n.title]));
  const items = [];
  let isolated = 0;
  let groupIdx = 0;
  for (const comp of model.components) {
    if (comp.size === 1) { isolated++; continue; }
    groupIdx++;
    let sunTitle = '';
    for (const id of comp) {
      if (model.sunIds.has(id)) { sunTitle = titleById.get(id) ?? ''; break; }
    }
    items.push(`<li>${escapeHtml(t.a11y.graphSummaryGroup(groupIdx, comp.size, sunTitle))}</li>`);
  }
  if (isolated > 0) items.push(`<li>${escapeHtml(t.a11y.graphSummaryIsolated(isolated))}</li>`);

  el.innerHTML = items.length ? `<ul>${items.join('')}</ul>` : '';
}

function statCard(label, value) {
  return `
    <div class="relative bg-ink-900/60 border border-ink-800 rounded-xl px-2 py-2.5 text-center overflow-hidden group hover:border-ink-700 transition-colors cursor-default">
      <!-- Linie de accent subtilă în partea de sus — sugerează că cardul e "activ" -->
      <div class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-signal-400/25 to-transparent"></div>
      <div class="text-[11px] uppercase tracking-[0.14em] text-paper-500/85 group-hover:text-paper-500 transition-colors">${escapeHtml(label)}</div>
      <div class="font-mono text-lg text-paper-100 mt-0.5 tabular-nums leading-none">${value}</div>
    </div>
  `;
}