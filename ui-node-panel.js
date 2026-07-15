/**
 * ui-node-panel.js — Floating node detail/action panel
 * =============================================================================
 * Mounts an absolutely-positioned <aside> inside #canvas-wrapper.
 * Opens whenever a node is selected; closes on deselect / Esc.
 * Hosts all node actions: view description, collapse children,
 * mark as task, mark done, edit, delete.
 * =============================================================================
 */

import { getNoteById, updateNote, deleteNote, subscribe } from './store.js';
import { escapeHtml } from './security.js';
import { announce } from './dom.js';
import { t } from './i18n.js';
import * as Attachments from './attachments.js';

/* ─────────────────────────── Module state ─────────────────────────── */

let wrapperEl = null;
let panelEl   = null;
let getScreenPos = null;  // () → {x, y, r} | null
let onEditCb  = null;     // (id) → void
let onSetSunCb = null;    // (id) → void — handles unset-others in component
let onFocusCb = null;     // (id) → void — triggers focus mode

let currentId   = null;
let rafId       = null;
let deleteArmed = false;
/** Atașamentul cu preview deschis (id) + URL-ul de obiect activ (de revocat). */
let previewAttachId = null;
let previewObjectUrl = null;

/* ─────────────────────────── Public API ─────────────────────────── */

export function mount(canvasWrapper, { getScreenPos: getPos, onEdit, onSetSun, onFocus }) {
  wrapperEl    = canvasWrapper;
  getScreenPos = getPos;
  onEditCb     = onEdit;
  onSetSunCb   = onSetSun;
  onFocusCb    = onFocus || null;

  panelEl = document.createElement('aside');
  panelEl.id = 'node-panel';
  panelEl.setAttribute('aria-label', t.panel.panelLabel);
  panelEl.className = 'node-panel hidden';
  panelEl.addEventListener('click', handleClick);
  wrapperEl.appendChild(panelEl);

  subscribe(() => {
    if (currentId) refresh();
  });
}

export function show(id) {
  if (!id) { hide(); return; }
  currentId   = id;
  deleteArmed = false;
  render();
  panelEl.classList.remove('hidden');
  startPositionLoop();
  const note = getNoteById(id);
  if (note) announce(t.a11y.panelOpened(note.title));
}

export function hide() {
  if (!currentId) return;
  currentId   = null;
  deleteArmed = false;
  clearPreview();
  panelEl.classList.add('hidden');
  stopPositionLoop();
  announce(t.a11y.panelClosed);
}

export function refresh() {
  if (!currentId) return;
  const note = getNoteById(currentId);
  if (!note) { hide(); return; }
  render();
}

/* ─────────────────────────── Render ─────────────────────────── */

function render() {
  const note = getNoteById(currentId);
  if (!note) { hide(); return; }

  const hasContent = note.content && note.content.trim().length > 0;
  const hasTags    = note.tags && note.tags.length > 0;

  panelEl.innerHTML = `
    <div class="node-panel-inner">
      <div class="node-panel-header">
        <h2 class="node-panel-title">${escapeHtml(note.title)}</h2>
        <button class="node-panel-close" data-action="close" aria-label="${escapeHtml(t.panel.closeLabel)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      ${hasTags ? `
        <div class="node-panel-tags">
          ${note.tags.map((tag) => `<span class="node-panel-tag">#${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}

      <div class="node-panel-content">
        ${hasContent
          ? `<p class="node-panel-desc">${escapeHtml(note.content).replace(/\n/g, '<br>')}</p>`
          : `<p class="node-panel-desc-empty">${escapeHtml(t.panel.descriptionEmpty)}</p>`
        }
      </div>

      ${renderAttachments(note)}

      <div class="node-panel-actions">
        <button class="node-panel-btn node-panel-btn--ghost ${note.isSun ? 'node-panel-btn--active' : ''}" data-action="toggle-sun">
          ${sunIcon(note.isSun)}
          <span>${escapeHtml(note.isSun ? t.panel.unsetSunLabel : t.panel.setSunLabel)}</span>
        </button>

        <button class="node-panel-btn node-panel-btn--ghost" data-action="toggle-collapse" title="${escapeHtml(note.collapsed ? t.panel.expandLabel : t.panel.collapseLabel)}">
          ${note.collapsed ? collapseIcon('expanded') : collapseIcon('collapsed')}
          <span>${escapeHtml(note.collapsed ? t.panel.expandLabel : t.panel.collapseLabel)}</span>
        </button>

        <button class="node-panel-btn node-panel-btn--ghost ${note.isTask ? 'node-panel-btn--active' : ''}" data-action="toggle-task" title="${escapeHtml(note.isTask ? t.panel.unmarkTaskLabel : t.panel.markTaskLabel)}">
          ${taskIcon(note.isTask)}
          <span>${escapeHtml(note.isTask ? t.panel.unmarkTaskLabel : t.panel.markTaskLabel)}</span>
        </button>

        ${note.isTask ? `
          <button class="node-panel-btn node-panel-btn--ghost ${note.done ? 'node-panel-btn--done' : ''}" data-action="toggle-done">
            ${doneIcon(note.done)}
            <span>${escapeHtml(note.done ? t.panel.markUndoneLabel : t.panel.markDoneLabel)}</span>
          </button>
        ` : ''}

        <button class="node-panel-btn node-panel-btn--ghost" data-action="focus-start" title="${escapeHtml(t.panel.focusLabel)}">
          ${focusIcon()}
          <span>${escapeHtml(t.panel.focusLabel)}</span>
        </button>

        <div class="node-panel-divider"></div>

        <button class="node-panel-btn node-panel-btn--ghost" data-action="edit">
          ${editIcon()}
          <span>${escapeHtml(t.panel.editLabel)}</span>
        </button>

        <button class="node-panel-btn node-panel-btn--danger ${deleteArmed ? 'node-panel-btn--armed' : ''}" data-action="delete">
          ${deleteIcon()}
          <span>${escapeHtml(deleteArmed ? t.panel.deleteConfirmLabel : t.panel.deleteLabel)}</span>
        </button>
      </div>
    </div>
  `;
}

/* ─────────────────────────── Atașamente ─────────────────────────── */

function renderAttachments(note) {
  const list = note.attachments || [];
  if (list.length === 0) return '';

  const rows = list.map((a) => `
    <div class="node-panel-attach-row">
      <button
        class="node-panel-attach-name ${a.id === previewAttachId ? 'node-panel-attach-name--active' : ''}"
        data-action="attach-preview"
        data-attach-id="${escapeHtml(a.id)}"
        title="${escapeHtml(t.panel.attachPreviewLabel(a.name))}"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        <span>${escapeHtml(a.name)}</span>
      </button>
      <button class="node-panel-attach-action" data-action="attach-open" data-attach-id="${escapeHtml(a.id)}" aria-label="${escapeHtml(t.panel.attachOpenLabel(a.name))}" title="${escapeHtml(t.panel.attachOpenLabel(a.name))}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </button>
      <button class="node-panel-attach-action" data-action="attach-download" data-attach-id="${escapeHtml(a.id)}" aria-label="${escapeHtml(t.panel.attachDownloadLabel(a.name))}" title="${escapeHtml(t.panel.attachDownloadLabel(a.name))}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
    </div>
  `).join('');

  return `
    <div class="node-panel-attachments" aria-label="${escapeHtml(t.panel.attachmentsHeading)}">
      ${rows}
      <div id="attach-preview-area"></div>
    </div>
  `;
}

function clearPreview() {
  previewAttachId = null;
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
}

async function getAttachment(attachId) {
  const note = getNoteById(currentId);
  const meta = note?.attachments?.find((a) => a.id === attachId);
  if (!meta) return null;
  try {
    const blob = await Attachments.get(attachId);
    return blob ? { meta, blob } : { meta, blob: null };
  } catch {
    return { meta, blob: null };
  }
}

async function togglePreview(attachId) {
  if (previewAttachId === attachId) {
    clearPreview();
    render();
    return;
  }
  const found = await getAttachment(attachId);
  if (!found) return;
  clearPreview();
  previewAttachId = attachId;
  render();

  const area = panelEl.querySelector('#attach-preview-area');
  if (!area) return;
  const { meta, blob } = found;

  if (!blob) {
    area.textContent = t.panel.attachMissing;
    area.className = 'node-panel-attach-missing';
    return;
  }

  if (meta.type.startsWith('image/')) {
    previewObjectUrl = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = previewObjectUrl;
    img.alt = meta.name;
    img.className = 'node-panel-attach-img';
    area.replaceChildren(img);
  } else if (meta.type === 'text/plain' || meta.type === 'text/markdown') {
    const text = await blob.text();
    const pre = document.createElement('pre');
    pre.className = 'node-panel-attach-text';
    // textContent — browserul NU interpretează conținutul ca HTML (zero XSS)
    pre.textContent = text.slice(0, 4000) + (text.length > 4000 ? '\n…' : '');
    area.replaceChildren(pre);
  } else {
    // PDF: preview inline ar cere object/embed (object-src 'none' în CSP) —
    // se deschide în tab nou prin acțiunea "open"
    openAttachment(attachId);
    clearPreview();
    render();
  }
}

async function openAttachment(attachId) {
  const found = await getAttachment(attachId);
  if (!found?.blob) return;
  const url = URL.createObjectURL(found.blob);
  window.open(url, '_blank', 'noopener');
  // Revocăm după ce tab-ul nou a preluat resursa
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function downloadAttachment(attachId) {
  const found = await getAttachment(attachId);
  if (!found?.blob) return;
  const url = URL.createObjectURL(found.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = found.meta.name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────── Action handling ─────────────────────────── */

function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const note = getNoteById(currentId);
  if (!note && action !== 'close') return;

  switch (action) {
    case 'close':
      hide();
      break;

    case 'attach-preview':
      togglePreview(btn.dataset.attachId);
      break;

    case 'attach-open':
      openAttachment(btn.dataset.attachId);
      break;

    case 'attach-download':
      downloadAttachment(btn.dataset.attachId);
      break;

    case 'toggle-sun': {
      if (note.isSun) {
        updateNote(currentId, { isSun: false });
        announce(t.a11y.sunUnpinned(note.title));
      } else {
        if (onSetSunCb) onSetSunCb(currentId);
        else updateNote(currentId, { isSun: true });
        announce(t.a11y.sunPinned(note.title));
      }
      break;
    }

    case 'toggle-collapse': {
      const next = !note.collapsed;
      updateNote(currentId, { collapsed: next });
      announce(next ? t.a11y.collapsed(note.title) : t.a11y.expanded(note.title));
      break;
    }

    case 'toggle-task': {
      const next = !note.isTask;
      updateNote(currentId, { isTask: next, done: next ? note.done : false });
      announce(next ? t.a11y.markedTask(note.title) : t.a11y.unmarkedTask(note.title));
      break;
    }

    case 'toggle-done': {
      const next = !note.done;
      updateNote(currentId, { done: next });
      announce(next ? t.a11y.markedDone(note.title) : t.a11y.markedUndone(note.title));
      break;
    }

    case 'focus-start': {
      const id = currentId;
      hide();
      if (onFocusCb) onFocusCb(id);
      break;
    }

    case 'edit':
      if (onEditCb) onEditCb(currentId);
      break;

    case 'delete':
      if (!deleteArmed) {
        deleteArmed = true;
        render();
        // Auto-disarm after 3s
        setTimeout(() => {
          if (deleteArmed) { deleteArmed = false; if (currentId) render(); }
        }, 3000);
      } else {
        const id = currentId;
        hide();
        deleteNote(id);
      }
      break;
  }
}

/* ─────────────────────────── Position loop ─────────────────────────── */

function startPositionLoop() {
  stopPositionLoop();
  function step() {
    if (!currentId) return;
    positionPanel();
    rafId = requestAnimationFrame(step);
  }
  rafId = requestAnimationFrame(step);
}

function stopPositionLoop() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

function positionPanel() {
  if (!currentId || !wrapperEl || !panelEl) return;
  const pos = getScreenPos(currentId);
  if (!pos) {
    // node hidden (collapsed ancestor) — hide panel
    hide();
    return;
  }

  const { x, y, r } = pos;
  const wRect = wrapperEl.getBoundingClientRect();
  const pRect = panelEl.getBoundingClientRect();
  const pw = pRect.width  || 280;
  const ph = pRect.height || 200;

  const OFFSET = 14;
  const MARGIN = 8;

  let left = x + r + OFFSET;
  let top  = y - ph / 2;

  // Flip left if overflowing right edge
  if (left + pw > wRect.width - MARGIN) {
    left = x - r - OFFSET - pw;
  }
  // Clamp horizontally
  left = Math.max(MARGIN, Math.min(left, wRect.width - pw - MARGIN));
  // Clamp vertically
  top  = Math.max(MARGIN, Math.min(top,  wRect.height - ph - MARGIN));

  panelEl.style.left = `${left}px`;
  panelEl.style.top  = `${top}px`;
}

/* ─────────────────────────── Icon helpers ─────────────────────────── */

function collapseIcon(state) {
  // state = 'collapsed' means node IS currently expanded (show "collapse" action icon)
  return state === 'collapsed'
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>`;
}

function taskIcon(isTask) {
  return isTask
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 12 11 14 15 10"/></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
}

function doneIcon(isDone) {
  return isDone
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>`;
}

function sunIcon(active) {
  return active
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="20" x2="12" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
}

function editIcon() {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
}

function deleteIcon() {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
}

function focusIcon() {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`;
}
