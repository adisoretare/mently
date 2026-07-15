/**
 * ui-tasks.js — Secțiunea colapsabilă „Taskuri” din sidebar.
 * Filtrează notițele cu isTask===true, afișează contorul done/total și
 * ascunde implicit taskurile finalizate. Starea de pliere și „arată finalizate”
 * se salvează în localStorage, ca preferința să supraviețuiască unui refresh.
 * Nu vorbește direct cu alte componente — comunică prin callback-urile din ui.js.
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

/* ─────────────────────────── API public ─────────────────────────── */

/**
 * Montează secțiunea în containerul dat și citește preferințele din localStorage.
 * @param {HTMLElement} rootEl — elementul în care randăm secțiunea.
 * @param {{onSelect?: Function, onEdit?: Function}} [callbacks] — anunță ui.js la selectare/editare.
 */
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
  containerEl.addEventListener('keydown', handleKeydown);
}

/**
 * Randează secțiunea din lista completă de notițe (filtrăm aici taskurile).
 * @param {Array<Object>} notes — toate notițele din store.
 */
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

/**
 * Sincronizează selecția venită din exterior (ex: click pe canvas) cu lista de taskuri.
 * @param {string|null} id — id-ul notiței selectate sau null pentru deselectare.
 */
export function setSelectedId(id) {
  if (selectedId === id) return;
  selectedId = id;
  render(getNotes());
}

/* ─────────────── Gestionarea click-urilor (delegare de evenimente) ─────────────── */
// Un singur listener pe container în loc de câte unul pe fiecare card —
// funcționează și după re-randare, pentru că elementele noi „moștenesc” listener-ul.

function handleClick(e) {
  // Pliază/depliază secțiunea
  if (e.target.closest('[data-action="tasks-toggle"]')) {
    e.stopPropagation();
    collapsed = !collapsed;
    try { localStorage.setItem('mently:tasks:collapsed', collapsed); } catch (_) {}
    render(getNotes());
    announce(t.a11y.tasksToggled(!collapsed));
    return;
  }

  // Comută afișarea taskurilor finalizate
  if (e.target.closest('[data-action="tasks-show-done"]')) {
    e.stopPropagation();
    showDone = !showDone;
    try { localStorage.setItem('mently:tasks:showDone', showDone); } catch (_) {}
    render(getNotes());
    return;
  }

  // Butonul de ștergere — îl ignorăm aici (ștergerea e treaba panoului de nod, nu a noastră)
  if (e.target.closest('[data-action="delete"]')) {
    e.stopPropagation();
    return;
  }

  // Butonul de editare de pe card
  const editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    e.stopPropagation();
    const id = editBtn.dataset.noteId;
    if (onEditCb) onEditCb(id);
    return;
  }

  // Click pe card → selectare (trebuie verificat DUPĂ edit/delete,
  // altfel click-ul pe butoane ar declanșa și selectarea cardului)
  const card = e.target.closest('[data-note-id]');
  if (card) {
    const id = card.dataset.noteId;
    selectedId = selectedId === id ? null : id;
    if (onSelectCb) onSelectCb(selectedId);
    render(getNotes());
    return;
  }
}

/* ─────────────── Gestionarea tastaturii (delegare de evenimente) ─────────────── */
// Enter/Spațiu pe un card = echivalentul click-ului, pentru navigarea fără mouse.

function handleKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('[data-note-id]');
  if (!card || e.target !== card) return;
  e.preventDefault();
  const id = card.dataset.noteId;
  selectedId = selectedId === id ? null : id;
  if (onSelectCb) onSelectCb(selectedId);
  render(getNotes());
}
