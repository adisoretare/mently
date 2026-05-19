/**
 * ui-form.js — Componenta de formular pentru adăugare notițe
 * =============================================================================
 * DECIZII ARHITECTURALE (Cap. III — Interacțiune):
 *
 * 1. STATEFUL COMPONENT
 *    Spre deosebire de listă (full re-render OK), formularul își păstrează DOM-ul.
 *    Motiv: utilizatorul tastează → re-render-ul ar pierde focus-ul/caret-ul.
 *    Listener-ii sunt atașați ÎN mount(); doar tag chips se re-randează intern.
 *
 * 2. TAG CHIPS PATTERN
 *    Variantă strictă "doar Enter" (alegerea utilizatorului):
 *      - Enter → creează chip
 *      - Backspace pe input gol → șterge ultimul chip
 *      - Click pe × → șterge chip-ul respectiv
 *    Tag-urile sunt normalizate (lowercase, trim) și validate (regex strict).
 *
 * 3. VALIDARE CLIENT-SIDE
 *    Erorile sunt afișate INLINE (sub câmp) cu `role="alert"` → cititoarele de
 *    ecran le anunță automat. ARIA-describedby leagă input-ul de mesajul de eroare.
 *
 * 4. KEYBOARD-FIRST UX
 *    După submit reușit, focus revine la titlu → utilizator poate adăuga rapid
 *    multe notițe fără mouse (esențial pentru power-users și pentru jurați la demo).
 *
 * 5. PROGRESSIVE DISCLOSURE
 *    Hint-ul "Tag-urile comune devin muchii" e afișat sub câmpul de tags — explică
 *    "magia" aplicației exact unde se întâmplă, fără tutorial intruziv.
 * =============================================================================
 */

import { t } from './i18n.js';
import { addNote } from './store.js';
import { announce, escapeHtml } from './dom.js';

const MAX_TAGS = 10;
const MAX_TITLE = 200;
const MAX_CONTENT = 10000;

// Regex pentru tag valid: litere, cifre, cratimă, underscore. Lowercase la save.
const TAG_REGEX = /^[a-z0-9\u00e0-\u017f][a-z0-9\u00e0-\u017f_-]*$/;

/* Internal state — exists o singură instanță în aplicație. */
let formEl = null;
let titleInput = null;
let contentInput = null;
let tagInput = null;
let tagWrapEl = null;
let submitBtn = null;
let formErrorEl = null;
let titleErrorEl = null;
let tags = []; // tag-uri introduse până la submit

/* ─────────────────────────── Mount ─────────────────────────── */

export function mount(container) {
  container.innerHTML = template();

  formEl       = container.querySelector('#note-form');
  titleInput   = container.querySelector('#note-title');
  contentInput = container.querySelector('#note-content');
  tagInput     = container.querySelector('#note-tag-input');
  tagWrapEl    = container.querySelector('#tag-chips-wrap');
  submitBtn    = container.querySelector('#note-submit');
  formErrorEl  = container.querySelector('#form-error');
  titleErrorEl = container.querySelector('#title-error');

  attachListeners();
}

/* ─────────────────────────── Template ─────────────────────────── */

function template() {
  return `
    <h2 class="text-[11px] uppercase tracking-[0.18em] text-paper-500/80 mb-3">${escapeHtml(t.form.heading)}</h2>

    <form id="note-form" novalidate class="space-y-3.5" aria-label="${escapeHtml(t.form.heading)}">

      <!-- Title -->
      <div>
        <label for="note-title" class="block text-[11px] font-medium text-paper-300 mb-1.5">
          ${escapeHtml(t.form.titleLabel)}
          <span class="text-signal-400" aria-hidden="true">*</span>
          <span class="sr-only">(obligatoriu)</span>
        </label>
        <input
          id="note-title"
          name="title"
          type="text"
          maxlength="${MAX_TITLE}"
          required
          autocomplete="off"
          spellcheck="false"
          placeholder="${escapeHtml(t.form.titlePlaceholder)}"
          class="w-full bg-ink-950/60 border border-ink-800 rounded-md px-3 py-2 text-sm text-paper-100 placeholder-paper-500/40 focus:border-signal-400 outline-none transition-colors"
          aria-required="true"
          aria-describedby="title-error"
          aria-invalid="false"
        />
        <p id="title-error" class="hidden mt-1 text-xs text-red-400" role="alert"></p>
      </div>

      <!-- Content -->
      <div>
        <label for="note-content" class="flex items-baseline justify-between text-[11px] font-medium text-paper-300 mb-1.5">
          <span>${escapeHtml(t.form.contentLabel)}</span>
          <span class="text-paper-500/60 font-normal text-[10px]">${escapeHtml(t.form.optional)}</span>
        </label>
        <textarea
          id="note-content"
          name="content"
          rows="3"
          maxlength="${MAX_CONTENT}"
          placeholder="${escapeHtml(t.form.contentPlaceholder)}"
          class="w-full bg-ink-950/60 border border-ink-800 rounded-md px-3 py-2 text-sm text-paper-100 placeholder-paper-500/40 focus:border-signal-400 outline-none transition-colors resize-none"
        ></textarea>
      </div>

      <!-- Tags -->
      <div>
        <label for="note-tag-input" class="block text-[11px] font-medium text-paper-300 mb-1.5">
          ${escapeHtml(t.form.tagsLabel)}
        </label>
        <div
          id="tag-chips-wrap"
          class="flex flex-wrap items-center gap-1.5 bg-ink-950/60 border border-ink-800 rounded-md px-2 py-1.5 min-h-[42px] focus-within:border-signal-400 transition-colors cursor-text"
          role="group"
          aria-label="Tag-uri adăugate"
        >
          <input
            id="note-tag-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="${escapeHtml(t.form.tagsPlaceholder)}"
            class="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm text-paper-100 placeholder-paper-500/40 py-0.5 px-1"
            aria-describedby="tag-hint"
          />
        </div>
        <p id="tag-hint" class="mt-1 text-[10px] text-paper-500/60">${escapeHtml(t.form.tagsHint)}</p>
      </div>

      <p id="form-error" class="hidden text-xs text-red-400" role="alert"></p>

      <button
        id="note-submit"
        type="submit"
        class="w-full bg-signal-400 hover:bg-signal-300 active:bg-signal-500 text-ink-950 font-medium text-sm py-2.5 rounded-md transition-colors"
      >
        ${escapeHtml(t.form.submit)}
      </button>
    </form>
  `;
}

/* ─────────────────────────── Listeners ─────────────────────────── */

function attachListeners() {
  tagInput.addEventListener('keydown', handleTagKeydown);
  tagWrapEl.addEventListener('click', handleTagWrapClick);
  formEl.addEventListener('submit', handleSubmit);

  // Live counter atribut maxlength previne deja, dar îi dăm feedback la depășire
  titleInput.addEventListener('input', () => {
    if (titleInput.value.length > 0) hideFieldError(titleErrorEl, titleInput);
  });
}

/* ─────────────────────────── Tag chips ─────────────────────────── */

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
  // Click pe ×: ștergere chip
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
  // Click pe spațiul gol: focus pe input (UX: zona toată e clickable)
  if (e.target === tagWrapEl) tagInput.focus();
}

function commitTag(raw) {
  const tag = String(raw || '').trim().toLowerCase();
  if (!tag) return;

  if (!TAG_REGEX.test(tag)) {
    showFormError(t.errors.invalidTag);
    flashError(tagWrapEl);
    return;
  }
  if (tags.includes(tag)) {
    showFormError(t.errors.duplicateTag);
    flashError(tagWrapEl);
    return;
  }
  if (tags.length >= MAX_TAGS) {
    showFormError(t.errors.tagsTooMany);
    return;
  }

  tags.push(tag);
  tagInput.value = '';
  hideFormError();
  renderChips();
}

function renderChips() {
  // Ștergem chip-urile existente, păstrăm input-ul
  tagWrapEl.querySelectorAll('[data-chip]').forEach((c) => c.remove());

  // Inserăm chip-urile noi înainte de input
  tags.forEach((tag, idx) => {
    const chip = document.createElement('span');
    chip.dataset.chip = idx;
    chip.className = 'inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-signal-400/15 text-signal-300 border border-signal-400/30';
    // tag-ul e deja validat prin TAG_REGEX → safe, dar escape-uim oricum din principiu (defense-in-depth)
    chip.innerHTML = `
      <span>${escapeHtml(tag)}</span>
      <button
        type="button"
        data-remove-chip="${idx}"
        class="hover:text-signal-400 focus-visible:text-signal-400 focus-visible:outline-none -mr-0.5 px-0.5"
        aria-label="Șterge tag ${escapeHtml(tag)}"
      >×</button>
    `;
    tagWrapEl.insertBefore(chip, tagInput);
  });
}

/* ─────────────────────────── Submit ─────────────────────────── */

function handleSubmit(e) {
  e.preventDefault();
  hideFormError();
  hideFieldError(titleErrorEl, titleInput);

  // UX forgiving: dacă utilizatorul a tastat un tag dar n-a apăsat Enter, îl commit-uim
  if (tagInput.value.trim()) commitTag(tagInput.value);

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();

  if (!title) {
    showFieldError(titleErrorEl, titleInput, t.errors.titleRequired);
    titleInput.focus();
    return;
  }
  if (title.length > MAX_TITLE) {
    showFieldError(titleErrorEl, titleInput, t.errors.titleTooLong);
    titleInput.focus();
    return;
  }
  if (content.length > MAX_CONTENT) {
    showFormError(t.errors.contentTooLong);
    contentInput.focus();
    return;
  }

  try {
    const note = addNote({ title, content, tags: [...tags] });
    announce(t.a11y.noteAdded(note.title));
    resetForm();
  } catch (err) {
    showFormError(err.message || 'Eroare necunoscută.');
  }
}

function resetForm() {
  formEl.reset();
  tags = [];
  renderChips();
  // Focus revine la titlu → power-users adaugă rapid succesiv
  titleInput.focus();
}

/* ─────────────────────────── Error display ─────────────────────────── */

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

/** Mic puls roșu pe border pentru feedback vizual la erori. */
function flashError(el) {
  el.classList.add('border-red-500');
  setTimeout(() => el.classList.remove('border-red-500'), 500);
}
