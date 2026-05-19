/**
 * ui-list.js — Lista de notițe (cards) + tag filtering
 * =============================================================================
 * DECIZII ARHITECTURALE:
 *
 * 1. FULL RE-RENDER — lista nu conține input, deci re-render nu pierde focus.
 * 2. EVENT DELEGATION — un listener pe container.
 * 3. TAG FILTERING — click pe tag chip declanșează highlight pe canvas
 *    (canvas.js execută BFS pe componenta conexă).
 * 4. ACTIVE FILTER STATE vizual — tag-urile active se diferențiază; bara de
 *    filtru de sus permite anularea rapidă (X).
 * 5. ESCAPE LA TEMPLATE — title/content/tags vin de la user → ALL escape-d.
 * =============================================================================
 */

import { t } from './i18n.js';
import { getNotes, deleteNote, getNoteById } from './store.js';
import { announce, escapeHtml } from './dom.js';

let containerEl = null;
let selectedId = null;
let activeTag = null; // tag-ul curent folosit ca filtru (pentru highlight vizual)

const selectListeners = new Set();
const tagClickListeners = new Set();

/* ─────────────────────────── Public API ─────────────────────────── */

export function mount(container) {
  containerEl = container;
  containerEl.addEventListener('click', handleClick);
  containerEl.addEventListener('keydown', handleKeydown);
}

export function render(notes) {
  if (!containerEl) return;

  if (notes.length === 0) {
    containerEl.innerHTML = renderEmpty();
    selectedId = null;
    activeTag = null;
    return;
  }

  // Cleanup dacă selectedId a fost șters între timp
  if (selectedId && !notes.find((n) => n.id === selectedId)) {
    selectedId = null;
    notifySelect();
  }
  // Cleanup dacă activeTag nu mai există în nicio notiță
  if (activeTag && !notes.some((n) => n.tags.includes(activeTag))) {
    activeTag = null;
    notifyTag(null);
  }

  containerEl.innerHTML = `
    <header class="flex items-baseline justify-between mb-3">
      <h2 class="text-[11px] uppercase tracking-[0.18em] text-paper-500/80">${escapeHtml(t.list.heading)}</h2>
      <span class="text-[10px] font-mono text-paper-500/60 tabular-nums">
        ${notes.length === 1 ? escapeHtml(t.list.countOne) : escapeHtml(t.list.countMany(notes.length))}
      </span>
    </header>

    ${activeTag ? renderActiveFilter(activeTag) : ''}

    <ul class="space-y-2" role="list">
      ${notes.map(renderCard).join('')}
    </ul>
  `;
}

export function onSelect(fn) {
  selectListeners.add(fn);
  return () => selectListeners.delete(fn);
}

export function onTagClick(fn) {
  tagClickListeners.add(fn);
  return () => tagClickListeners.delete(fn);
}

export function getSelectedId() {
  return selectedId;
}

/** Sync extern (apel din canvas.js când utilizatorul selectează în graf). */
export function setSelectedId(id) {
  if (selectedId === id) return;
  selectedId = id;
  render(getNotes());
}

export function setActiveTag(tag) {
  if (activeTag === tag) return;
  activeTag = tag;
  render(getNotes());
}

/* ─────────────────────────── Templates ─────────────────────────── */

function renderEmpty() {
  return `
    <section aria-label="${escapeHtml(t.list.heading)}" class="bg-ink-900/40 border border-dashed border-ink-800 rounded-md p-5">
      <p class="font-display italic text-2xl text-paper-300 leading-snug">
        Empty mind, full potential.
      </p>
      <p class="mt-2 text-sm text-paper-500/90 leading-relaxed">
        ${escapeHtml(t.list.empty)}
      </p>
    </section>
  `;
}

function renderActiveFilter(tag) {
  return `
    <div class="mb-3 flex items-center gap-2 px-3 py-2 bg-signal-400/10 border border-signal-400/30 rounded-md">
      <span class="text-[10px] uppercase tracking-wider text-signal-300/80">Filtru</span>
      <span class="text-xs font-mono text-signal-300">${escapeHtml(tag)}</span>
      <button
        type="button"
        data-action="clear-filter"
        class="ml-auto text-signal-300 hover:text-signal-400 transition-colors p-0.5"
        aria-label="${escapeHtml(t.list.clearFilterLabel)}"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;
}

function renderCard(note) {
  const isSelected = note.id === selectedId;
  const hasContent = !!note.content;
  const hasTags = Array.isArray(note.tags) && note.tags.length > 0;

  const borderClass = isSelected ? 'border-signal-400' : 'border-ink-800 hover:border-ink-700';
  const ariaSelected = isSelected ? 'true' : 'false';

  return `
    <li>
      <article
        data-note-id="${escapeHtml(note.id)}"
        class="group relative bg-ink-900/70 border ${borderClass} rounded-md p-3 pr-9 cursor-pointer transition-colors focus-within:border-signal-400"
        tabindex="0"
        role="button"
        aria-pressed="${ariaSelected}"
        aria-label="${escapeHtml(t.list.selectLabel(note.title))}"
      >
        <h3 class="text-sm font-medium text-paper-100 leading-snug">${escapeHtml(note.title)}</h3>

        ${hasContent ? `
          <p class="mt-1 text-xs text-paper-500/90 leading-relaxed line-clamp-2">
            ${escapeHtml(note.content)}
          </p>
        ` : ''}

        ${hasTags ? `
          <ul class="mt-2 flex flex-wrap gap-1" role="list">
            ${note.tags.map((tag) => renderTagChip(tag)).join('')}
          </ul>
        ` : ''}

        <button
          type="button"
          data-action="delete"
          data-note-id="${escapeHtml(note.id)}"
          class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-paper-500 hover:text-red-400 focus-visible:text-red-400 p-1 rounded"
          aria-label="${escapeHtml(t.list.deleteLabel(note.title))}"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/>
          </svg>
        </button>
      </article>
    </li>
  `;
}

function renderTagChip(tag) {
  const isActive = tag === activeTag;
  const className = isActive
    ? 'bg-signal-400/20 text-signal-300 border-signal-400/50'
    : 'bg-ink-800 text-paper-300 border-ink-700 hover:border-signal-400/40 hover:text-signal-300';

  return `
    <li>
      <button
        type="button"
        data-tag="${escapeHtml(tag)}"
        class="text-[10px] font-mono px-1.5 py-0.5 rounded border ${className} transition-colors focus-visible:outline-none focus-visible:border-signal-400"
        aria-label="${escapeHtml(t.list.tagFilterLabel(tag))}"
        aria-pressed="${isActive ? 'true' : 'false'}"
      >${escapeHtml(tag)}</button>
    </li>
  `;
}

/* ─────────────────────────── Events ─────────────────────────── */

function handleClick(e) {
  // Clear filter
  if (e.target.closest('[data-action="clear-filter"]')) {
    e.stopPropagation();
    activeTag = null;
    notifyTag(null);
    render(getNotes());
    return;
  }

  // Delete
  const deleteBtn = e.target.closest('[data-action="delete"]');
  if (deleteBtn) {
    e.stopPropagation();
    const id = deleteBtn.dataset.noteId;
    const note = getNoteById(id);
    if (!note) return;
    deleteNote(id);
    announce(t.a11y.noteDeleted(note.title));
    return;
  }

  // Tag click → filter
  const tagBtn = e.target.closest('[data-tag]');
  if (tagBtn) {
    e.stopPropagation();
    const tag = tagBtn.dataset.tag;
    // Toggle: dacă e deja activ, dezactivează
    activeTag = activeTag === tag ? null : tag;
    notifyTag(activeTag);
    render(getNotes());
    if (activeTag) announce(t.a11y.tagHighlighted(activeTag));
    return;
  }

  // Card click → select
  const card = e.target.closest('[data-note-id]');
  if (card) {
    toggleSelect(card.dataset.noteId);
  }
}

function handleKeydown(e) {
  // Enter/Space pe card focusat = select
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('[data-note-id]');
  if (!card || e.target !== card) return;
  e.preventDefault();
  toggleSelect(card.dataset.noteId);
}

function toggleSelect(id) {
  selectedId = selectedId === id ? null : id;
  if (selectedId) {
    const note = getNoteById(selectedId);
    if (note) announce(t.a11y.noteSelected(note.title));
  }
  render(getNotes());
  notifySelect();
}

function notifySelect() {
  for (const fn of selectListeners) {
    try { fn(selectedId); } catch (err) { console.error('[ui-list] selectListener:', err); }
  }
}

function notifyTag(tag) {
  for (const fn of tagClickListeners) {
    try { fn(tag); } catch (err) { console.error('[ui-list] tagClickListener:', err); }
  }
}