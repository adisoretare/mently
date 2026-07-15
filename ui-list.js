// Lista de carduri + edit/delete + export/import. Comunică prin callbacks (onSelect/onEdit/onTagClick).

import { t } from './i18n.js';
import { getNotes, deleteNote, clearAll, getNoteById, exportJSON, replaceNotes } from './store.js';
import { announce } from './dom.js';
import { escapeHtml, parseAndValidateImport, LIMITS } from './security.js';
import { filterNotes, highlightHtml } from './search.js';
import * as Attachments from './attachments.js';

let containerEl = null;
let itemsEl = null;      // sub-containerul re-randat; separat de căsuța de căutare
let selectedId = null;
let activeTag = null;
let searchQuery = '';
let searchDebounce = null;

let clearAllArmed = false;
let clearAllTimer = null;
let importError = null;
let importErrorTimer = null;
let armedDeleteId = null;
let armedDeleteTimer = null;

const selectListeners = new Set();
const tagClickListeners = new Set();
const editListeners = new Set();

export function mount(container) {
  containerEl = container;

  // STRUCTURĂ ÎN DOUĂ PĂRȚI: căsuța de căutare e montată O SINGURĂ DATĂ
  // (dacă ar fi în render(), rebuild-ul innerHTML i-ar distruge focusul și
  // valoarea la fiecare tastă). Doar #list-items se re-randează.
  containerEl.innerHTML = `
    <div id="list-search" class="mb-3"></div>
    <div id="list-items"></div>
  `;
  itemsEl = containerEl.querySelector('#list-items');
  mountSearchBox(containerEl.querySelector('#list-search'));

  containerEl.addEventListener('click', handleClick);
  containerEl.addEventListener('keydown', handleKeydown);
}

function mountSearchBox(wrapper) {
  wrapper.innerHTML = `
    <input
      type="search"
      id="note-search"
      class="list-search-input"
      placeholder="${escapeHtml(t.list.searchPlaceholder)}"
      aria-label="${escapeHtml(t.list.searchLabel)}"
      autocomplete="off"
    />
  `;
  const input = wrapper.querySelector('#note-search');

  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = input.value;
      const visible = filterNotes(getNotes(), searchQuery);
      render(getNotes());
      if (searchQuery.trim()) announce(t.a11y.searchResults(visible.length));
    }, 150); // debounce: nu re-randăm la fiecare tastă
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.stopPropagation(); // nu închide drawer-ul / nu iese din fullscreen
      input.value = '';
      searchQuery = '';
      render(getNotes());
    }
  });
}

export function render(notes) {
  if (!itemsEl) return;

  // Căsuța de căutare apare doar când există note
  const searchWrap = containerEl.querySelector('#list-search');
  if (searchWrap) searchWrap.style.display = notes.length === 0 ? 'none' : '';

  if (notes.length === 0) {
    itemsEl.innerHTML = renderEmpty();
    selectedId = null;
    activeTag = null;
    searchQuery = '';
    disarmClearAll();
    disarmDelete();
    return;
  }

  if (selectedId && !notes.find((n) => n.id === selectedId)) {
    selectedId = null;
    notifySelect();
  }
  if (activeTag && !notes.some((n) => n.tags.includes(activeTag))) {
    activeTag = null;
    notifyTag(null);
  }

  const visible = filterNotes(notes, searchQuery);
  const isFiltered = searchQuery.trim().length > 0;
  const countLabel = isFiltered
    ? `${visible.length}/${notes.length}`
    : (notes.length === 1 ? t.list.countOne : t.list.countMany(notes.length));

  itemsEl.innerHTML = `
    <header class="flex items-baseline justify-between mb-3">
      <h2 class="text-[11px] uppercase tracking-[0.18em] text-paper-500/80">${escapeHtml(t.list.heading)}</h2>
      <span class="text-[11px] font-mono text-paper-500/80 tabular-nums">${escapeHtml(countLabel)}</span>
    </header>

    ${activeTag ? renderActiveFilter(activeTag) : ''}

    ${visible.length === 0
      ? `<p class="text-xs text-paper-500/70 text-center py-4">${escapeHtml(t.list.searchNoResults)}</p>`
      : `<ul class="space-y-2" role="list">${visible.map(renderCard).join('')}</ul>`}

    ${renderClearAll()}
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
export function onEdit(fn) {
  editListeners.add(fn);
  return () => editListeners.delete(fn);
}

export function getSelectedId() { return selectedId; }
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

function renderEmpty() {
  return `
    <section aria-label="${escapeHtml(t.list.heading)}" class="bg-ink-900/30 border border-dashed border-ink-800/80 rounded-2xl p-6 text-center">
      <!-- animate-float definit în style.css — oscilație lentă, dezactivat la reduced-motion -->
      <div class="animate-float inline-block">
        <p class="font-display italic text-2xl text-paper-300/80 leading-snug">
          ${escapeHtml(t.list.emptyHero)}
        </p>
      </div>
      <p class="mt-3 text-xs text-paper-500/70 leading-relaxed">
        ${escapeHtml(t.list.empty)}
      </p>
    </section>
  `;
}

function renderActiveFilter(tag) {
  return `
    <div class="mb-3 flex items-center gap-2 px-3 py-2 bg-signal-400/10 border border-signal-400/30 rounded-md">
      <span class="text-[11px] uppercase tracking-wider text-signal-300/90">${escapeHtml(t.list.filterLabel)}</span>
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

export function renderCard(note) {
  const isSelected = note.id === selectedId;
  const hasContent = !!note.content;
  const hasTags = Array.isArray(note.tags) && note.tags.length > 0;

  const borderClass = isSelected
    ? 'border-signal-400/70 bg-ink-800/50'
    : 'border-ink-800 hover:border-ink-700';
  const ariaSelected = isSelected ? 'true' : 'false';

  const doneClass = note.done ? ' done' : '';

  return `
    <li>
      <article
        data-note-id="${escapeHtml(note.id)}"
        class="mently-card group relative bg-ink-900/60 border ${borderClass} rounded-xl p-3 pr-3 cursor-pointer${doneClass}"
        tabindex="0"
        role="button"
        aria-pressed="${ariaSelected}"
        aria-label="${escapeHtml(t.list.selectLabel(note.title))}"
      >
        <div class="flex items-center gap-1.5">
          ${note.isTask ? `
            <span class="note-task-badge ${note.done ? 'note-task-badge--done' : ''}" aria-hidden="true">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${note.done ? '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' : '<rect x="3" y="3" width="18" height="18" rx="2"/>'}
              </svg>
            </span>
          ` : ''}
          <h3 class="mently-card-title text-sm font-medium text-paper-100 leading-snug pr-14">${highlightHtml(note.title, searchQuery, escapeHtml)}</h3>
        </div>

        ${hasContent ? `
          <p class="mt-1 text-xs text-paper-500/90 leading-relaxed line-clamp-2">
            ${highlightHtml(note.content, searchQuery, escapeHtml)}
          </p>
        ` : ''}

        ${hasTags ? `
          <ul class="mt-2 flex flex-wrap gap-1" role="list">
            ${note.tags.map((tag) => renderTagChip(tag)).join('')}
          </ul>
        ` : ''}

        ${(note.attachments && note.attachments.length > 0) ? `
          <span class="mt-1.5 inline-flex items-center gap-1 text-[10px] text-paper-500/70 font-mono" title="${escapeHtml(note.attachments.map((a) => a.name).join(', '))}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            ${note.attachments.length}
          </span>
        ` : ''}

        <!-- Action icons row (edit + delete) -->
        <div class="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            data-action="edit"
            data-note-id="${escapeHtml(note.id)}"
            class="text-paper-500 hover:text-signal-300 focus-visible:text-signal-300 p-1 rounded"
            aria-label="${escapeHtml(t.list.editLabel(note.title))}"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button
            type="button"
            data-action="delete"
            data-note-id="${escapeHtml(note.id)}"
            class="${note.id === armedDeleteId ? 'text-red-400 animate-pulse' : 'text-paper-500 hover:text-red-400 focus-visible:text-red-400'} p-1 rounded"
            aria-label="${escapeHtml(note.id === armedDeleteId ? t.list.deleteConfirm : t.list.deleteLabel(note.title))}"
            aria-pressed="${note.id === armedDeleteId}"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/>
            </svg>
          </button>
        </div>
      </article>
    </li>
  `;
}

export function renderTagChip(tag) {
  const isActive = tag === activeTag;
  const className = isActive
    ? 'bg-signal-400/20 text-signal-300 border-signal-400/50'
    : 'bg-ink-800/80 text-paper-500 border-ink-700/60 hover:border-signal-400/40 hover:text-signal-300 hover:bg-ink-700/50';

  return `
    <li>
      <button
        type="button"
        data-tag="${escapeHtml(tag)}"
        class="mently-btn text-[11px] font-mono px-2 py-0.5 rounded-full border ${className} focus-visible:outline-none focus-visible:border-signal-400"
        aria-label="${escapeHtml(t.list.tagFilterLabel(tag))}"
        aria-pressed="${isActive ? 'true' : 'false'}"
      >${escapeHtml(tag)}</button>
    </li>
  `;
}

function renderClearAll() {
  const clearAllBtn = clearAllArmed
    ? `<button
        type="button"
        data-action="clear-all-confirm"
        class="mently-btn text-[10px] text-red-400 hover:text-red-300 font-medium underline underline-offset-2 animate-pulse"
        aria-pressed="true"
      >${escapeHtml(t.list.clearAllConfirm)}</button>`
    : `<button
        type="button"
        data-action="clear-all"
        class="mently-btn text-[11px] text-paper-500/80 hover:text-red-400 underline underline-offset-2 transition-colors"
        aria-pressed="false"
      >${escapeHtml(t.list.clearAll)}</button>`;

  return `
    <div class="mt-6 pt-4 border-t border-ink-800/30">
      ${importError ? `<p class="text-xs text-red-400 text-center mb-3" role="alert">${escapeHtml(importError)}</p>` : ''}
      <div class="flex items-center justify-center gap-5">
        <button
          type="button"
          data-action="export"
          class="mently-btn flex items-center gap-1.5 text-[11px] text-paper-500/80 hover:text-paper-300 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          ${escapeHtml(t.list.exportBtn)}
        </button>
        <button
          type="button"
          data-action="import"
          class="mently-btn flex items-center gap-1.5 text-[11px] text-paper-500/80 hover:text-paper-300 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 5 17 10"/>
            <line x1="12" y1="5" x2="12" y2="17"/>
          </svg>
          ${escapeHtml(t.list.importBtn)}
        </button>
        ${clearAllBtn}
      </div>
    </div>
  `;
}

function handleClick(e) {
  // Clear filter
  if (e.target.closest('[data-action="clear-filter"]')) {
    e.stopPropagation();
    activeTag = null;
    notifyTag(null);
    render(getNotes());
    return;
  }

  // Export
  if (e.target.closest('[data-action="export"]')) {
    e.stopPropagation();
    handleExport();
    return;
  }

  // Import
  if (e.target.closest('[data-action="import"]')) {
    e.stopPropagation();
    handleImport();
    return;
  }

  // Clear all (armed first click)
  if (e.target.closest('[data-action="clear-all"]')) {
    e.stopPropagation();
    armClearAll();
    return;
  }

  // Clear all (confirm second click)
  if (e.target.closest('[data-action="clear-all-confirm"]')) {
    e.stopPropagation();
    disarmClearAll();
    clearAll();
    announce(t.a11y.clearAllDone);
    return;
  }

  // Edit
  const editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    e.stopPropagation();
    const id = editBtn.dataset.noteId;
    if (getNoteById(id)) notifyEdit(id);
    return;
  }

  // Delete (2-click confirm)
  const deleteBtn = e.target.closest('[data-action="delete"]');
  if (deleteBtn) {
    e.stopPropagation();
    const id = deleteBtn.dataset.noteId;
    const note = getNoteById(id);
    if (!note) return;

    if (armedDeleteId === id) {
      // Al doilea click — confirmă ștergerea
      disarmDelete();
      deleteNote(id);
      announce(t.a11y.noteDeleted(note.title));
    } else {
      // Primul click — armează
      armDelete(id, note.title);
    }
    return;
  }

  // Tag filter
  const tagBtn = e.target.closest('[data-tag]');
  if (tagBtn) {
    e.stopPropagation();
    const tag = tagBtn.dataset.tag;
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
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('[data-note-id]');
  if (!card || e.target !== card) return;
  e.preventDefault();
  toggleSelect(card.dataset.noteId);
}

async function handleExport() {
  const json = exportJSON();

  // Împachetăm și fișierele atașate (base64) → un singur JSON portabil.
  // Blob-urile lipsă (IndexedDB golit manual) sunt sărite — metadata rămâne.
  const payload = JSON.parse(json);
  const files = {};
  for (const note of getNotes()) {
    for (const att of (note.attachments || [])) {
      try {
        const blob = await Attachments.get(att.id);
        if (blob) files[att.id] = await Attachments.blobToBase64(blob);
      } catch { /* IndexedDB indisponibil — exportăm doar notele */ }
    }
  }
  if (Object.keys(files).length > 0) payload.files = files;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mently-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  announce(t.a11y.exported);
}

function handleImport() {
  // Elementul nu trebuie adăugat în DOM pentru a putea primi click() — evităm leak-ul pe cancel
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > LIMITS.JSON_IMPORT_MAX_BYTES) {
      setImportError(t.errors.importTooLarge);
      return;
    }

    try {
      const text = await file.text();
      const { notes, files, importedCount, skippedCount } = parseAndValidateImport(text);
      replaceNotes(notes);

      // Restaurăm blob-urile atașamentelor în IndexedDB. Verificăm dimensiunea
      // REALĂ a blob-ului decodat (base64-ul poate minți în metadata).
      for (const note of notes) {
        for (const att of (note.attachments || [])) {
          const b64 = files?.[att.id];
          if (!b64) continue;
          try {
            const blob = Attachments.base64ToBlob(b64, att.type);
            if (blob.size > 0 && blob.size <= LIMITS.ATTACHMENT_MAX_BYTES) {
              await Attachments.put(att.id, blob);
            }
          } catch { /* base64 corupt — sărim fișierul, nota rămâne */ }
        }
      }

      announce(t.a11y.imported(importedCount, skippedCount));
      clearImportError();
    } catch (err) {
      setImportError(t.errors.importFailed(err.message));
    }
  });

  fileInput.click();
}

function setImportError(msg) {
  importError = msg;
  if (importErrorTimer) clearTimeout(importErrorTimer);
  importErrorTimer = setTimeout(() => {
    importError = null;
    importErrorTimer = null;
    render(getNotes());
  }, 6000);
  render(getNotes());
}

function clearImportError() {
  importError = null;
  if (importErrorTimer) { clearTimeout(importErrorTimer); importErrorTimer = null; }
}

function armDelete(id, title) {
  armedDeleteId = id;
  announce(t.a11y.deleteArmed(title));
  render(getNotes());
  if (armedDeleteTimer) clearTimeout(armedDeleteTimer);
  armedDeleteTimer = setTimeout(() => {
    if (armedDeleteId === id) {
      disarmDelete();
      render(getNotes());
    }
  }, 3000);
}

function disarmDelete() {
  armedDeleteId = null;
  if (armedDeleteTimer) {
    clearTimeout(armedDeleteTimer);
    armedDeleteTimer = null;
  }
}

function armClearAll() {
  clearAllArmed = true;
  announce(t.a11y.clearAllArmed);
  render(getNotes());
  if (clearAllTimer) clearTimeout(clearAllTimer);
  clearAllTimer = setTimeout(() => {
    if (clearAllArmed) {
      disarmClearAll();
      render(getNotes());
    }
  }, 3000);
}

function disarmClearAll() {
  clearAllArmed = false;
  if (clearAllTimer) {
    clearTimeout(clearAllTimer);
    clearAllTimer = null;
  }
}

function toggleSelect(id) {
  // Click pe un alt card dezarmează confirmarea de ștergere — userul s-a răzgândit.
  // Fără asta, selectarea unui card diferit lăsa butonul roșu "armat" vizibil pe cardul anterior.
  if (armedDeleteId && armedDeleteId !== id) disarmDelete();
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
function notifyEdit(id) {
  for (const fn of editListeners) {
    try { fn(id); } catch (err) { console.error('[ui-list] editListener:', err); }
  }
}