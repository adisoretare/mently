/**
 * focus.js — „Modul focus”: parcurgere pas cu pas a sub-arborelui unui nod.
 * Ideea: apeși F pe un nod selectat și aplicația te plimbă prin toate notițele
 * din care „se construiește” acel nod — frunzele întâi, ținta la final —
 * cu un spotlight pe canvas și o bară de navigare (înainte/înapoi/ieșire).
 * Ordinea pașilor vine dintr-un DFS post-ordine peste arborele BFS al grafului.
 */

import { getNotes, getNoteById, subscribe } from './store.js';
import { buildGraphModel } from './graph.js';
import { announce } from './dom.js';
import { escapeHtml } from './security.js';
import { t } from './i18n.js';
import * as Canvas from './canvas.js';

/* ─── Stare internă ─── */

let active = false;
let steps = [];       // lista ordonată de id-uri de notițe (frunzele întâi, ținta ultima)
let stepIndex = 0;    // pasul curent (indexat de la 0)
let targetId = null;
let storeUnsub = null;
let preFocusSelectedId = null; // selecția de dinainte de focus — o refacem la ieșire

let barEl = null;          // elementul #focus-bar din DOM (creat „leneș”, doar la prima nevoie)
let canvasWrapper = null;  // containerul canvasului, primit prin init()

/* ─── API public ─── */

/**
 * Inițializează modul focus: reține containerul canvasului și instalează
 * ascultătorul global de tastatură (F pornește, săgețile navighează, Esc iese).
 * @param {HTMLElement} wrapperEl — elementul-înveliș al canvasului; în el se montează bara.
 */
export function init(wrapperEl) {
  if (canvasWrapper) return; // gardă anti dublă-inițializare — altfel am atașa listener-ul de două ori
  canvasWrapper = wrapperEl;

  window.addEventListener('keydown', (e) => {
    // Gardă: ignorăm tastele când utilizatorul scrie într-un câmp de text.
    // e.target poate fi `document` (fără .matches) la evenimente sintetice — verificăm defensiv.
    if (typeof e.target?.matches === 'function'
      && e.target.matches('input,textarea,[contenteditable],select')) return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

    if (!active) {
      if (e.key === 'f' || e.key === 'F') {
        const id = Canvas.getSelected();
        if (id) start(id);
      }
      return;
    }

    // Navigare cu tastatura cât timp modul focus e activ
    if (e.key === 'Escape') { exit(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); return; }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); prev(); return; }
  });
}

/**
 * Pornește modul focus pe notița dată: calculează pașii de parcurs,
 * afișează bara de navigare și anunță cititoarele de ecran.
 * @param {string} id — id-ul notiței țintă (ultimul pas din traseu).
 */
export function start(id) {
  if (!id) return;
  const notes = getNotes();
  const noteObj = getNoteById(id);
  if (!noteObj) return;

  preFocusSelectedId = Canvas.getSelected(); // memorăm selecția curentă înainte s-o suprascriem
  targetId = id;
  steps = computeSteps(id, notes);
  stepIndex = 0;
  active = true;

  // Ne abonăm la schimbările din store cât timp suntem în focus
  // (dacă utilizatorul șterge/adaugă notițe, traseul trebuie recalculat)
  if (storeUnsub) storeUnsub();
  storeUnsub = subscribe(() => handleStoreChange());

  applyStep();
  showBar();
  announce(t.a11y.focusStarted(noteObj.title));
}

/** Trece la pasul următor (nu face nimic dacă suntem deja la ultimul). */
export function next() {
  if (!active || stepIndex >= steps.length - 1) return;
  stepIndex++;
  applyStep();
}

/** Se întoarce la pasul anterior (nu face nimic dacă suntem la primul). */
export function prev() {
  if (!active || stepIndex <= 0) return;
  stepIndex--;
  applyStep();
}

/**
 * Iese din modul focus: golește starea, oprește abonamentul la store,
 * stinge spotlight-ul de pe canvas și restaurează selecția de dinainte.
 */
export function exit() {
  if (!active) return;
  active = false;
  steps = [];
  stepIndex = 0;
  targetId = null;

  if (storeUnsub) { storeUnsub(); storeUnsub = null; }

  Canvas.setSpotlight(null);
  // refacem selecția care era activă înainte de pornirea modului focus
  Canvas.setSelected(preFocusSelectedId);
  preFocusSelectedId = null;

  hideBar();
  announce(t.a11y.focusExited);
}

/** Spune celorlalte module dacă modul focus e activ în acest moment. */
export function isActive() { return active; }

/* ─── Calculul pașilor ─── */

function computeSteps(id, notes) {
  // Folosim arborele BFS real (nesuprascris) — așa DFS-ul vizitează
  // doar sub-arborele care chiar aparține nodului nostru, nu tot graful.
  const model = buildGraphModel(notes);

  // Aflăm în ce componentă conexă (grup de noduri legate între ele) e ținta
  const compIdx = model.componentIndexById.get(id);
  if (compIdx === undefined) return [id]; // nod izolat — nu aparține niciunui grup

  const comp = model.components[compIdx]; // un Set<string> cu id-urile din grup

  // Construim harta părinte → copii inversând bfsParent în interiorul componentei.
  // BFS-ul ne dă doar „cine e părintele fiecărui nod”; nouă ne trebuie inversul.
  const children = new Map();
  for (const nodeId of comp) {
    if (!children.has(nodeId)) children.set(nodeId, []);
    const parent = model.bfsParent.get(nodeId);
    if (parent !== null && parent !== undefined) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(nodeId);
    }
  }

  // Hartă id → notiță, ca să putem sorta copiii după titlu mai jos
  const notesById = new Map(notes.map((n) => [n.id, n]));

  // DFS post-ordine, scris iterativ (cu stivă, nu recursiv).
  // Post-ordine = vizităm ÎNTÂI copiii, apoi părintele — exact logica de învățare:
  // parcurgi „ingredientele” înainte de rezultat, iar ținta apare ultima.
  // Copiii sunt sortați după titlu ca ordinea să fie stabilă și previzibilă
  // (altfel ar depinde de ordinea internă a Map/Set, care poate varia).
  const result = [];
  const stack = [[id, false]]; // perechi [idNod, copiiiAuFostPușiPeStivă]

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const frameId = frame[0];
    const childrenPushed = frame[1];

    if (!childrenPushed) {
      frame[1] = true; // marcăm „copiii au fost puși” chiar pe cadrul curent (in place)
      const kids = (children.get(frameId) ?? [])
        .slice()
        .sort((a, b) => {
          const na = notesById.get(a);
          const nb = notesById.get(b);
          return (na?.title ?? '').localeCompare(nb?.title ?? '');
        });
      // Punem copiii pe stivă în ordine inversă — stiva e LIFO,
      // deci primul copil (alfabetic) ajunge procesat primul
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push([kids[i], false]);
      }
    } else {
      stack.pop();
      result.push(frameId);
    }
  }

  // Excludem nodurile ascunse (au un strămoș pliat) —
  // ar fi derutant să „vizităm” noduri pe care utilizatorul nu le vede
  return result.filter((nodeId) => !model.hiddenIds.has(nodeId));
}

/* ─── Aplicarea unui pas ─── */

function applyStep() {
  if (!active || steps.length === 0) return;
  const id = steps[stepIndex];
  Canvas.setSpotlight(id);
  Canvas.setSelected(id);

  const note = getNoteById(id);
  if (note) announce(t.a11y.focusStep(stepIndex + 1, steps.length, note.title));

  updateBar();
}

/* ─── Reacția la schimbări în store ─── */

function handleStoreChange() {
  if (!active) return;
  const notes = getNotes();

  // Dacă notița țintă a fost ștearsă, ieșim din modul focus
  if (!getNoteById(targetId)) { exit(); return; }

  // Recalculăm pașii de la zero — muchiile/tag-urile noi trebuie reflectate în traseu
  const newSteps = computeSteps(targetId, notes);
  if (newSteps.length === 0) { exit(); return; }

  // Încercăm să-l ținem pe utilizator la aceeași notiță;
  // dacă ea a dispărut din traseu, ne limităm la ultimul pas valid
  const currentStepId = steps[stepIndex];
  const newIdx = newSteps.indexOf(currentStepId);
  steps = newSteps;
  stepIndex = newIdx >= 0 ? newIdx : Math.min(stepIndex, steps.length - 1);
  applyStep();
}

/* ─── Bara de navigare (DOM) ─── */

function ensureBar() {
  if (barEl) return barEl;
  if (!canvasWrapper) return null;

  barEl = document.createElement('div');
  barEl.id = 'focus-bar';
  barEl.setAttribute('role', 'region');
  // aria-live e „difuzorul” pentru cititoarele de ecran; îl punem doar pe corpul
  // pasului (mai jos, în updateBar), nu pe toată bara — altfel s-ar anunța și butoanele
  barEl.setAttribute('aria-live', 'off');
  canvasWrapper.appendChild(barEl);

  barEl.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'focus-prev') prev();
    else if (action === 'focus-next') next();
    else if (action === 'focus-exit') exit();
  });

  return barEl;
}

function showBar() {
  const bar = ensureBar();
  if (!bar) return;
  bar.style.display = 'flex';
  updateBar();
}

function hideBar() {
  if (!barEl) return;
  barEl.style.display = 'none';
  barEl.innerHTML = '';
}

function updateBar() {
  const bar = ensureBar();
  if (!bar || !active || steps.length === 0) return;

  const id = steps[stepIndex];
  const note = getNoteById(id);
  const title = note ? escapeHtml(note.title) : escapeHtml(t.focus.unavailable);

  const isFirst = stepIndex === 0;
  const isLast  = stepIndex === steps.length - 1;
  const isOnly  = steps.length === 1;

  const stepText = escapeHtml(t.focus.stepLabel(stepIndex + 1, steps.length));
  const hintText = isOnly ? `<span class="focus-bar-hint">${escapeHtml(t.focus.noPrereq)}</span>` : '';

  bar.innerHTML = `
    <button
      class="focus-bar-nav"
      data-action="focus-prev"
      aria-label="${escapeHtml(t.focus.prev)}"
      ${isFirst ? 'disabled' : ''}
    >‹</button>
    <div class="focus-bar-body" aria-live="polite" aria-atomic="true">
      <span class="focus-bar-step">${stepText}</span>
      <strong class="focus-bar-title">${title}</strong>
      ${hintText}
    </div>
    <button
      class="focus-bar-nav"
      data-action="focus-next"
      aria-label="${escapeHtml(t.focus.next)}"
      ${isLast ? 'disabled' : ''}
    >›</button>
    <button
      class="focus-bar-exit"
      data-action="focus-exit"
      aria-label="${escapeHtml(t.focus.exit)}"
    >${escapeHtml(t.focus.exit)}</button>
  `;
}
