// Formular add/edit dual-mode. Comunică prin callbacks; nu cunoaște alte componente.

import { t } from './i18n.js';
import { addNote, updateNote, getNoteById, subscribe } from './store.js';
import { announce } from './dom.js';
import {
  escapeHtml,
  sanitizeTag,
  LIMITS,
} from './security.js';

let formEl = null;
let titleInput = null;
let contentInput = null;
let tagInput = null;
let tagWrapEl = null;
let submitBtn = null;
let cancelBtn = null;
let formHeading = null;
let formErrorEl = null;
let titleErrorEl = null;

let tags = [];
/** null = add mode; id string = edit mode pentru nota respectivă. */
let editingId = null;

export function mount(container) {
  container.innerHTML = template();

  formEl       = container.querySelector('#note-form');
  titleInput   = container.querySelector('#note-title');
  contentInput = container.querySelector('#note-content');
  tagInput     = container.querySelector('#note-tag-input');
  tagWrapEl    = container.querySelector('#tag-chips-wrap');
  submitBtn    = container.querySelector('#note-submit');
  cancelBtn    = container.querySelector('#note-cancel');
  formHeading  = container.querySelector('#form-heading');
  formErrorEl  = container.querySelector('#form-error');
  titleErrorEl = container.querySelector('#title-error');

  attachListeners();

  // Dacă nota editată dispare (clear all, delete extern), ieșim silent.
  subscribe(() => {
    if (editingId && !getNoteById(editingId)) {
      exitEditMode({ silent: true });
    }
  });
}

/**
 * Intră în edit mode pentru o notiță existentă.
 * Populează câmpurile, schimbă heading-ul și submit-ul, dezvăluie Cancel.
 */
export function enterEditMode(noteId) {
  const note = getNoteById(noteId);
  if (!note) return false;

  editingId = noteId;

  // Populare câmpuri
  titleInput.value = note.title;
  contentInput.value = note.content || '';
  tags = [...(note.tags || [])];
  renderChips();

  // UI mode switch
  formHeading.textContent = `${t.form.headingEdit}: ${truncate(note.title, 28)}`;
  submitBtn.textContent = t.form.submitEdit;
  cancelBtn.classList.remove('hidden');
  hideFormError();
  hideFieldError(titleErrorEl, titleInput);

  // Focus + select-all pentru editare rapidă
  titleInput.focus();
  titleInput.select();

  // Scroll formularul în viewport (util pe mobil/sidebar scrollabil)
  formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  announce(t.a11y.editingStart(note.title));
  return true;
}

/** Ieși din edit mode → revine la add mode. */
export function exitEditMode({ silent = false } = {}) {
  if (!editingId) return;
  editingId = null;

  formEl.reset();
  tags = [];
  renderChips();

  formHeading.textContent = t.form.headingAdd;
  submitBtn.textContent = t.form.submitAdd;
  cancelBtn.classList.add('hidden');
  hideFormError();
  hideFieldError(titleErrorEl, titleInput);

  if (!silent) announce(t.a11y.editingCancel);
}

export function isEditing() {
  return editingId !== null;
}

function template() {
  return `
    <h2 id="form-heading" class="text-[11px] uppercase tracking-[0.18em] text-paper-500/80 mb-3">
      ${escapeHtml(t.form.headingAdd)}
    </h2>

    <form id="note-form" novalidate class="space-y-3.5" aria-labelledby="form-heading">

      <div>
        <label for="note-title" class="block text-[11px] font-medium text-paper-300 mb-1.5">
          ${escapeHtml(t.form.titleLabel)}
          <span class="text-signal-400" aria-hidden="true">*</span>
          <span class="sr-only">${escapeHtml(t.form.requiredHint)}</span>
        </label>
        <input
          id="note-title"
          name="title"
          type="text"
          maxlength="${LIMITS.TITLE_MAX_LENGTH}"
          required
          autocomplete="off"
          spellcheck="false"
          placeholder="${escapeHtml(t.form.titlePlaceholder)}"
          class="mently-input w-full bg-ink-950/50 border border-ink-800 rounded-xl px-3 py-2 text-sm text-paper-100 placeholder-paper-500/30 outline-none transition-colors"
          aria-required="true"
          aria-describedby="title-error"
          aria-invalid="false"
        />
        <p id="title-error" class="hidden mt-1 text-xs text-red-400" role="alert"></p>
      </div>

      <div>
        <label for="note-content" class="flex items-baseline justify-between text-[11px] font-medium text-paper-300 mb-1.5">
          <span>${escapeHtml(t.form.contentLabel)}</span>
          <span class="text-paper-500/60 font-normal text-[10px]">${escapeHtml(t.form.optional)}</span>
        </label>
        <textarea
          id="note-content"
          name="content"
          rows="3"
          maxlength="${LIMITS.CONTENT_MAX_LENGTH}"
          placeholder="${escapeHtml(t.form.contentPlaceholder)}"
          class="mently-input w-full bg-ink-950/50 border border-ink-800 rounded-xl px-3 py-2 text-sm text-paper-100 placeholder-paper-500/30 outline-none transition-colors resize-none"
        ></textarea>
      </div>

      <div>
        <label for="note-tag-input" class="block text-[11px] font-medium text-paper-300 mb-1.5">
          ${escapeHtml(t.form.tagsLabel)}
        </label>
        <div
          id="tag-chips-wrap"
          class="mently-input flex flex-wrap items-center gap-1.5 bg-ink-950/50 border border-ink-800 rounded-xl px-2 py-1.5 min-h-[42px] transition-colors cursor-text"
          role="group"
          aria-label="${escapeHtml(t.form.tagsAddedLabel)}"
        >
          <input
            id="note-tag-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            maxlength="${LIMITS.TAG_MAX_LENGTH}"
            placeholder="${escapeHtml(t.form.tagsPlaceholder)}"
            class="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm text-paper-100 placeholder-paper-500/40 py-0.5 px-1"
            aria-describedby="tag-hint"
          />
        </div>
        <p id="tag-hint" class="mt-1 text-[10px] text-paper-500/60">${escapeHtml(t.form.tagsHint)}</p>
      </div>

      <p id="form-error" class="hidden text-xs text-red-400" role="alert"></p>

      <!-- Butoanele de acțiune: Submit + Cancel (Cancel ascuns în add mode) -->
      <div class="flex items-stretch gap-2">
        <button
          id="note-submit"
          type="submit"
          class="mently-btn flex-1 bg-gradient-to-b from-signal-300 to-signal-400 hover:from-signal-400 hover:to-signal-500 text-ink-950 font-semibold text-sm py-2.5 rounded-xl shadow-sm transition-all"
        >
          ${escapeHtml(t.form.submitAdd)}
        </button>
        <button
          id="note-cancel"
          type="button"
          class="mently-btn hidden px-4 bg-ink-800/80 hover:bg-ink-700 border border-ink-700 hover:border-ink-600 text-paper-500 hover:text-paper-300 font-medium text-sm py-2.5 rounded-xl transition-all"
        >
          ${escapeHtml(t.form.cancel)}
        </button>
      </div>
    </form>
  `;
}

function attachListeners() {
  tagInput.addEventListener('keydown', handleTagKeydown);
  tagWrapEl.addEventListener('click', handleTagWrapClick);
  formEl.addEventListener('submit', handleSubmit);
  cancelBtn.addEventListener('click', () => exitEditMode());

  titleInput.addEventListener('input', () => {
    if (titleInput.value.length > 0) hideFieldError(titleErrorEl, titleInput);
  });

  // Esc în interiorul formularului → cancel edit (dar nu interferă cu Esc global pe canvas)
  formEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editingId) {
      e.stopPropagation();
      exitEditMode();
    }
  });
}

function handleTagKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitTag(tagInput.value);
  } else if (e.key === 'Backspace' && tagInput.value === '' && tags.length > 0) {
    tags.pop();
    renderChips();
  }
}

function handleTagWrapClick(e) {
  const removeBtn = e.target.closest('[data-remove-chip]');
  if (removeBtn) {
    const idx = Number(removeBtn.dataset.removeChip);
    if (Number.isInteger(idx)) {
      tags.splice(idx, 1);
      renderChips();
      tagInput.focus();
    }
    return;
  }
  if (e.target === tagWrapEl) tagInput.focus();
}

function commitTag(raw) {
  const clean = sanitizeTag(raw);
  if (!clean) {
    if (String(raw).trim()) {
      showFormError(t.errors.invalidTag);
      flashError(tagWrapEl);
    }
    return false;
  }
  if (tags.includes(clean)) {
    showFormError(t.errors.duplicateTag);
    flashError(tagWrapEl);
    return false;
  }
  if (tags.length >= LIMITS.TAGS_MAX_COUNT) {
    showFormError(t.errors.tagsTooMany);
    return false;
  }

  tags.push(clean);
  tagInput.value = '';
  hideFormError();
  renderChips();
  return true;
}

function renderChips() {
  tagWrapEl.querySelectorAll('[data-chip]').forEach((c) => c.remove());

  tags.forEach((tag, idx) => {
    const chip = document.createElement('span');
    chip.dataset.chip = idx;
    chip.className = 'inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-signal-400/12 text-signal-300 border border-signal-400/25 select-none';
    chip.innerHTML = `
      <span>${escapeHtml(tag)}</span>
      <button
        type="button"
        data-remove-chip="${idx}"
        class="hover:text-signal-400 focus-visible:text-signal-400 focus-visible:outline-none -mr-0.5 px-0.5"
        aria-label="${escapeHtml(t.form.removeTagLabel(tag))}"
      >×</button>
    `;
    tagWrapEl.insertBefore(chip, tagInput);
  });
}

function handleSubmit(e) {
  e.preventDefault();
  hideFormError();
  hideFieldError(titleErrorEl, titleInput);

  // Dacă utilizatorul a lăsat ceva în tag input, încearcă să-l commit-uieze.
  // Dacă tag-ul e invalid, abort — eroarea e deja vizibilă.
  if (tagInput.value.trim()) {
    const committed = commitTag(tagInput.value);
    if (!committed) return;
  }

  const payload = {
    title: titleInput.value,
    content: contentInput.value,
    tags: [...tags],
  };

  try {
    if (editingId) {
      const note = updateNote(editingId, payload);
      if (note) {
        announce(t.a11y.noteUpdated(note.title));
        exitEditMode({ silent: true });
      }
    } else {
      const note = addNote(payload);
      announce(t.a11y.noteAdded(note.title));
      resetForm();
    }
  } catch (err) {
    if (err.code === 'TITLE_REQUIRED') {
      showFieldError(titleErrorEl, titleInput, t.errors.titleRequired);
      titleInput.focus();
    } else {
      showFormError(err.message || t.errors.unknown);
    }
  }
}

function resetForm() {
  formEl.reset();
  tags = [];
  renderChips();
  titleInput.focus();
}

function showFormError(msg) {
  formErrorEl.textContent = msg;
  formErrorEl.classList.remove('hidden');
}
function hideFormError() {
  formErrorEl.classList.add('hidden');
  formErrorEl.textContent = '';
}
function showFieldError(errEl, inputEl, msg) {
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
  inputEl.setAttribute('aria-invalid', 'true');
}
function hideFieldError(errEl, inputEl) {
  errEl.classList.add('hidden');
  errEl.textContent = '';
  inputEl.setAttribute('aria-invalid', 'false');
}
function flashError(el) {
  el.classList.add('border-red-500');
  setTimeout(() => el.classList.remove('border-red-500'), 500);
}

function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen - 1) + '…';
}