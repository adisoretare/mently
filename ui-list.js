// ui-list.js — lista de notițe din sidebar: carduri cu selecție, căutare cu
// debounce, filtrare pe tag, edit/delete cu confirmare în doi pași („armed"),
// plus export/import JSON al întregii colecții. Nu modifică alte componente
// direct — anunță ce s-a întâmplat prin callbacks (onSelect/onEdit/onTagClick),
// iar cine e interesat se abonează. Așa lista rămâne decuplată de restul UI-ului.

import { t } from './i18n.js';
import { getNotes, deleteNote, clearAll, getNoteById, exportJSON, replaceNotes } from './store.js';
import { announce } from './dom.js';
import { escapeHtml, parseAndValidateImport, LIMITS } from './security.js';
import { filterNotes, highlightHtml } from './search.js';
import * as Attachments from './attachments.js';

/* ─── Starea modulului (variabile private, vizibile doar în acest fișier) ─── */

let containerEl = null;
let itemsEl = null;      // sub-containerul re-randat; separat de căsuța de căutare
let selectedId = null;
let activeTag = null;
let searchQuery = '';
let searchDebounce = null; // id-ul timer-ului de debounce pentru căutare

// Starea pattern-ului „armed confirm": prima apăsare pe o acțiune distructivă
// doar „armează" butonul (devine roșu), a doua confirmă. Timer-ul dezarmează
// automat dacă utilizatorul nu confirmă la timp — protecție contra click-urilor
// accidentale, fără dialoguri modale enervante.
let clearAllArmed = false;
let clearAllTimer = null;
let importError = null;
let importErrorTimer = null;
let armedDeleteId = null;
let armedDeleteTimer = null;

// Set-uri de callbacks (observer pattern) — Set evită dublarea aceleiași funcții
const selectListeners = new Set();
const tagClickListeners = new Set();
const editListeners = new Set();

/**
 * Montează lista în containerul dat și leagă listener-ii de click/tastatură.
 * Se apelează o singură dată, la pornire.
 */
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

  // Event delegation: UN singur listener pe container pentru toate butoanele
  // din listă (edit, delete, export, tag-uri...). Cardurile se re-randează
  // constant prin innerHTML, deci listener-ii puși direct pe ele s-ar pierde;
  // containerul însă nu se schimbă niciodată. În handler aflăm ce s-a apăsat
  // după atributul data-action al țintei (closest()).
  containerEl.addEventListener('click', handleClick);
  containerEl.addEventListener('keydown', handleKeydown);
}

// Construiește căsuța de căutare și îi atașează logica de debounce.
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

  // Debounce: la fiecare tastă anulăm timer-ul precedent și pornim altul de
  // 150ms. Căutarea rulează efectiv doar când utilizatorul face o pauză scurtă
  // din tastat — altfel am re-randa toată lista la absolut fiecare caracter.
  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = input.value;
      const visible = filterNotes(getNotes(), searchQuery);
      render(getNotes());
      // anunțăm numărul de rezultate prin aria-live, pentru screen readere
      if (searchQuery.trim()) announce(t.a11y.searchResults(visible.length));
    }, 150);
  });

  // Esc golește căutarea în loc să lase evenimentul să urce mai sus
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.stopPropagation(); // altfel Esc ar închide drawer-ul / ar ieși din fullscreen
      input.value = '';
      searchQuery = '';
      render(getNotes());
    }
  });
}

/**
 * Redesenează complet lista de carduri pentru notele primite.
 * Strategia e simplă: reconstruim tot HTML-ul din #list-items la fiecare
 * schimbare (fără diffing) — la câteva zeci de note e mai mult decât rapid.
 * innerHTML e sigur doar pentru că fiecare valoare dinamică trece prin
 * escapeHtml; altfel un titlu de notă ar putea injecta HTML (XSS).
 * @param {Array} notes — toate notele din store
 */
export function render(notes) {
  if (!itemsEl) return;

  // Căsuța de căutare apare doar când există note
  const searchWrap = containerEl.querySelector('#list-search');
  if (searchWrap) searchWrap.style.display = notes.length === 0 ? 'none' : '';

  // Lista goală: afișăm mesajul de „bun venit" și resetăm complet starea
  if (notes.length === 0) {
    itemsEl.innerHTML = renderEmpty();
    selectedId = null;
    activeTag = null;
    searchQuery = '';
    disarmClearAll();
    disarmDelete();
    return;
  }

  // Curățenie de stare: dacă nota selectată sau tag-ul filtrat nu mai există
  // (au fost șterse între timp), renunțăm la ele și anunțăm abonații.
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

/* ─── API de abonare: fiecare on...() returnează o funcție de dezabonare,
   deci apelantul poate renunța oricând fără să cunoască intern Set-ul. ─── */

/** Abonează un callback la schimbarea selecției; returnează funcția de dezabonare. */
export function onSelect(fn) {
  selectListeners.add(fn);
  return () => selectListeners.delete(fn);
}
/** Abonează un callback la click pe un tag (filtrare); returnează dezabonarea. */
export function onTagClick(fn) {
  tagClickListeners.add(fn);
  return () => tagClickListeners.delete(fn);
}
/** Abonează un callback la cererea de editare a unei note; returnează dezabonarea. */
export function onEdit(fn) {
  editListeners.add(fn);
  return () => editListeners.delete(fn);
}

/** Returnează id-ul notei selectate curent (sau null). */
export function getSelectedId() { return selectedId; }
/** Setează selecția din exterior (ex. click pe nod în canvas) și re-randează. */
export function setSelectedId(id) {
  if (selectedId === id) return;
  selectedId = id;
  render(getNotes());
}
/** Setează filtrul de tag din exterior și re-randează lista. */
export function setActiveTag(tag) {
  if (activeTag === tag) return;
  activeTag = tag;
  render(getNotes());
}

// Starea „nicio notiță": un mesaj prietenos în locul unei liste goale.
function renderEmpty() {
  // Butonul de import rămâne disponibil și pe graf gol — altfel un utilizator
  // cu un backup JSON (sau demo-data.json) nu ar avea de unde să-l încarce.
  // Merge prin aceeași delegare de evenimente: data-action="import" e prins
  // de handleClick pe container, indiferent unde apare butonul.
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
      ${importError ? `<p class="mt-3 text-xs text-red-400" role="alert">${escapeHtml(importError)}</p>` : ''}
      <button
        type="button"
        data-action="import"
        class="mently-btn mt-4 inline-flex items-center gap-1.5 text-[11px] text-paper-500/80 hover:text-paper-300 border border-ink-800 hover:border-ink-700 rounded-xl px-4 py-2 transition-colors"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 5 17 10"/>
          <line x1="12" y1="5" x2="12" y2="17"/>
        </svg>
        ${escapeHtml(t.list.importBtn)}
      </button>
    </section>
  `;
}

// Banda de deasupra listei care arată tag-ul activ + butonul de anulare a filtrului.
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

/**
 * Construiește HTML-ul unui card de notiță (titlu, fragment de conținut,
 * tag-uri, indicator de atașamente, butoane edit/delete). Butoanele poartă
 * data-action + data-note-id — pe astea se bazează delegarea din handleClick.
 * @param {Object} note — nota de randat
 * @returns {string} HTML-ul cardului (tot ce e dinamic e trecut prin escapeHtml)
 */
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

        <!-- Rândul cu iconițele de acțiune (editare + ștergere) -->
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

/**
 * Construiește HTML-ul unui chip de tag clicabil (folosit pe carduri).
 * aria-pressed reflectă dacă tag-ul e filtrul activ — un buton „toggle".
 * @param {string} tag
 * @returns {string} HTML-ul chip-ului
 */
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

// Subsolul listei: export / import / „șterge tot". Butonul de clear all are
// două înfățișări, în funcție de starea armed (normal vs. roșu de confirmare).
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

// Dispatcher-ul central de click-uri (event delegation): identificăm acțiunea
// după data-action, de la cea mai specifică la cea mai generală. Ordinea
// contează — cardul e ultimul, ca butoanele din interiorul lui să aibă prioritate.
function handleClick(e) {
  // Anularea filtrului de tag
  if (e.target.closest('[data-action="clear-filter"]')) {
    e.stopPropagation();
    activeTag = null;
    notifyTag(null);
    render(getNotes());
    return;
  }

  // Export JSON
  if (e.target.closest('[data-action="export"]')) {
    e.stopPropagation();
    handleExport();
    return;
  }

  // Import JSON
  if (e.target.closest('[data-action="import"]')) {
    e.stopPropagation();
    handleImport();
    return;
  }

  // Șterge tot — primul click doar armează confirmarea
  if (e.target.closest('[data-action="clear-all"]')) {
    e.stopPropagation();
    armClearAll();
    return;
  }

  // Șterge tot — al doilea click confirmă și execută
  if (e.target.closest('[data-action="clear-all-confirm"]')) {
    e.stopPropagation();
    disarmClearAll();
    clearAll();
    announce(t.a11y.clearAllDone);
    return;
  }

  // Editare — doar anunțăm abonații; formularul preia de acolo
  const editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    e.stopPropagation();
    const id = editBtn.dataset.noteId;
    if (getNoteById(id)) notifyEdit(id);
    return;
  }

  // Ștergere cu confirmare în doi pași (pattern-ul „armed confirm")
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
      // Primul click — doar armează butonul
      armDelete(id, note.title);
    }
    return;
  }

  // Filtrare pe tag — click pe același tag anulează filtrul (toggle)
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

  // Click direct pe card → selectare/deselectare
  const card = e.target.closest('[data-note-id]');
  if (card) {
    toggleSelect(card.dataset.noteId);
  }
}

// Cardurile au role="button" + tabindex, deci trebuie să răspundă și la
// Enter/Space de la tastatură, nu doar la click (accesibilitate de bază).
function handleKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('[data-note-id]');
  if (!card || e.target !== card) return;
  e.preventDefault();
  toggleSelect(card.dataset.noteId);
}

// Exportă toate notele + atașamentele într-un singur fișier JSON descărcabil.
async function handleExport() {
  const json = exportJSON();

  // Împachetăm și fișierele atașate (codate base64) → un singur JSON portabil.
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

  // Trucul standard de descărcare din browser: URL.createObjectURL creează un
  // URL temporar (blob:...) către datele din memorie, îl punem pe un <a download>
  // și simulăm click-ul. Revocăm URL-ul imediat după, altfel blob-ul ar rămâne
  // ținut în memorie cât timp e deschisă pagina (memory leak).
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mently-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  announce(t.a11y.exported);
}

// Importă un fișier JSON exportat anterior: validare strictă, apoi înlocuire.
function handleImport() {
  // Un <input type="file"> creat din JS primește click() fără să fie în DOM —
  // așa nu rămâne niciun element orfan pe pagină dacă utilizatorul dă cancel.
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
      // REALĂ a blob-ului decodat — metadata din JSON poate minți, base64-ul nu.
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

// Afișează eroarea de import și o ascunde singură după 6 secunde.
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

// Armează ștergerea unei note: butonul devine roșu și pulsează, iar dacă
// utilizatorul nu confirmă în 3 secunde, se dezarmează singur. Verificarea
// `armedDeleteId === id` din timer previne dezarmarea greșită dacă între timp
// s-a armat ALTĂ notă.
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

// Dezarmează ștergerea și curăță timer-ul aferent.
function disarmDelete() {
  armedDeleteId = null;
  if (armedDeleteTimer) {
    clearTimeout(armedDeleteTimer);
    armedDeleteTimer = null;
  }
}

// Același pattern „armed confirm", dar pentru butonul „șterge tot".
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

// Selectează/deselectează un card și anunță abonații.
function toggleSelect(id) {
  // Click pe un alt card dezarmează confirmarea de ștergere — utilizatorul s-a
  // răzgândit. Fără asta, selectarea unui card diferit lăsa butonul roșu
  // „armat" vizibil pe cardul anterior.
  if (armedDeleteId && armedDeleteId !== id) disarmDelete();
  selectedId = selectedId === id ? null : id;
  if (selectedId) {
    const note = getNoteById(selectedId);
    if (note) announce(t.a11y.noteSelected(note.title));
  }
  render(getNotes());
  notifySelect();
}

/* ─── Notificarea abonaților. try/catch per callback: dacă un abonat aruncă
   o eroare, ceilalți tot își primesc notificarea. ─── */
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