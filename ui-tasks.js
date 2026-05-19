/**
 * ui-tasks.js — Secțiunea colapsabilă Tasks din sidebar
 * Filtrează notițele cu isTask===true, afișează done/total, ascunde finalizatele implicit.
 */

import { getNotes } from './store.js';
import { announce } from './dom.js';
import { escapeHtml } from './security.js';
import { t } from './i18n.js';
import { renderCard } from './ui-list.js';

/* ─────────────────────────── State intern ─────────────────────────── */

let containerEl = null;
let selectedId = null;
let collapsed = false;
let showDone = false;

let onSelectCb = null;
let onEditCb = null;

/* ─────────────────────────── Public API ─────────────────────────── */

export function mount(rootEl, { onSelect, onEdit } = {}) {
  containerEl = rootEl;

  try {
    collapsed = localStorage.getItem('mently:tasks:collapsed') === 'true';
  } catch (_) {}

  try {
    showDone = localStorage.getItem('mently:tasks:showDone') === 'true';
  } catch (_) {}

  onSelectCb = typeof onSelect === 'function' ? onSelect : null;
  onEditCb   = typeof onEdit   === 'function' ? onEdit   : null;

  containerEl.addEventListener('click', handleClick);
}

export function render(notes) {
  if (!containerEl) return;

  const taskNotes   = notes.filter((n) => n.isTask);
  const doneCount   = taskNotes.filter((n) => n.done).length;
  const total       = taskNotes.length;

  // Dacă selectedId nu mai există printre taskuri, curățăm starea locală
  if (selectedId && !taskNotes.find((n) => n.id === selectedId)) {
    selectedId = null;
  }

  const visibleNotes = showDone ? taskNotes : taskNotes.filter((n) => !n.done);

  containerEl.innerHTML = `
    <header class="tasks-header">
      <button
        class="tasks-toggle-btn"
        data-action="tasks-toggle"
        aria-expanded="${!collapsed}"
        aria-controls="tasks-list"
        aria-label="${escapeHtml(t.tasks.ariaToggle(!collapsed))}"
        type="button"
      >
        <span class="tasks-chevron${collapsed ? ' tasks-chevron--collapsed' : ''}" aria-hidden="true">▾</span>
        <span class="tasks-heading-text">${escapeHtml(t.tasks.heading)}</span>
        <span class="tasks-count-badge">${t.tasks.count(doneCount, total)}</span>
      </button>
      <button
        class="tasks-show-done-btn"
        data-action="tasks-show-done"
        aria-pressed="${showDone}"
        type="button"
        style="${total === 0 ? 'display:none' : ''}"
      >${showDone ? escapeHtml(t.tasks.hideDone) : escapeHtml(t.tasks.showDone)}</button>
    </header>

    <ul
      id="tasks-list"
      class="tasks-list space-y-2"
      role="list"
      aria-hidden="${collapsed}"
      ${collapsed ? 'style="display:none"' : ''}
    >
      ${total === 0
        ? `<li class="tasks-empty">${escapeHtml(t.tasks.empty)}</li>`
        : visibleNotes.map((note) => renderCard(note)).join('')
      }
    </ul>
  `;
}

export function setSelectedId(id) {
  if (selectedId === id) return;
  selectedId = id;
  render(getNotes());
}

/* ─────────────────────────── Click handling (delegated) ─────────────────────────── */

function handleClick(e) {
  // Toggle section collapse
  if (e.target.closest('[data-action="tasks-toggle"]')) {
    e.stopPropagation();
    collapsed = !collapsed;
    try { localStorage.setItem('mently:tasks:collapsed', collapsed); } catch (_) {}
    render(getNotes());
    announce(t.a11y.tasksToggled(!collapsed));
    return;
  }

  // Toggle show-done
  if (e.target.closest('[data-action="tasks-show-done"]')) {
    e.stopPropagation();
    showDone = !showDone;
    try { localStorage.setItem('mently:tasks:showDone', showDone); } catch (_) {}
    render(getNotes());
    return;
  }

  // Delete button — ignore (delete is handled by node panel, not here)
  if (e.target.closest('[data-action="delete"]')) {
    e.stopPropagation();
    return;
  }

  // Edit button on card
  const editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    e.stopPropagation();
    const id = editBtn.dataset.noteId;
    if (onEditCb) onEditCb(id);
    return;
  }

  // Card click → select (must come after edit/delete checks)
  const card = e.target.closest('[data-note-id]');
  if (card) {
    const id = card.dataset.noteId;
    selectedId = selectedId === id ? null : id;
    render(getNotes());
    if (onSelectCb) onSelectCb(selectedId);
    return;
  }
}
