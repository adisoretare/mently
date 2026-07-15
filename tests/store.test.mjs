// Teste unitare pentru store.js — stratul de stare + persistență.
// store.js e headless prin design (zero DOM, i18n injectat) — singura dependență
// de browser e localStorage, pe care o simulăm cu un stub in-memory de ~10 linii.
// Rulare: `node --test tests/`

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* ─── Stub localStorage (înainte de orice apel Store.init) ───
   store.js accesează localStorage doar în interiorul funcțiilor (nu la import),
   deci putem defini stub-ul global oricând înainte de init(). */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
  };
}
globalThis.localStorage = memoryStorage();

const Store = await import('../store.js');
const { SecurityError, LIMITS } = await import('../security.js');

const STORAGE_KEY = 'mently:v1:state';

/* ─── Hidratare / init ─── */

test('init: storage gol → stare fresh cu zero note', () => {
  localStorage.clear();
  Store.init();
  assert.deepEqual(Store.getNotes(), []);
});

test('init: JSON corupt în storage → reset + blob-ul corupt e șters', () => {
  localStorage.setItem(STORAGE_KEY, '{nu e json valid');
  Store.init();
  assert.deepEqual(Store.getNotes(), []);
  assert.equal(localStorage.getItem(STORAGE_KEY), null); // nu re-eșuează la următorul reload
});

test('init: notele corupte/manipulate din storage sunt filtrate individual', () => {
  const tampered = {
    version: 1,
    notes: [
      { id: 'ok1', title: 'valid', tags: [] },
      { content: 'fără titlu — invalid' },
      JSON.parse('{"title": "poluat", "__proto__": {"x": 1}}'),
    ],
    meta: {},
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tampered));
  Store.init();
  const notes = Store.getNotes();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'valid');
});

/* ─── CRUD ─── */

test('addNote: sanitizează și persistă', () => {
  localStorage.clear();
  Store.init();
  const note = Store.addNote({ title: '  Notă <b>  ', content: 'text', tags: ['JS', 'js'] });
  assert.equal(note.title, 'Notă <b>'); // sanitizare text, NU html-escape (escape e la render)
  assert.deepEqual(note.tags, ['js']);  // dedupe + lowercase
  assert.ok(note.id);
  // persistat în storage
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(saved.notes.length, 1);
});

test('addNote: titlu gol → SecurityError TITLE_REQUIRED', () => {
  assert.throws(
    () => Store.addNote({ title: '   ' }),
    (err) => err instanceof SecurityError && err.code === 'TITLE_REQUIRED'
  );
});

test('getNotes: returnează copii — mutarea rezultatului nu atinge store-ul', () => {
  localStorage.clear();
  Store.init();
  Store.addNote({ title: 'izolare', tags: ['a'] });
  const copy = Store.getNotes();
  copy[0].title = 'HACKED';
  copy[0].tags.push('injectat');
  assert.equal(Store.getNotes()[0].title, 'izolare');
  assert.deepEqual(Store.getNotes()[0].tags, ['a']);
});

test('updateNote: patch parțial + re-sanitizare per câmp', () => {
  localStorage.clear();
  Store.init();
  const { id } = Store.addNote({ title: 'original', tags: ['t'] });
  const updated = Store.updateNote(id, { title: '  nou  ', done: 1 });
  assert.equal(updated.title, 'nou');
  assert.equal(updated.done, true);
  assert.deepEqual(updated.tags, ['t']); // câmp neatins rămâne
  assert.equal(Store.updateNote('inexistent', { title: 'x' }), null);
  assert.throws(() => Store.updateNote(id, { title: '' }), SecurityError);
});

test('deleteNote: șterge și raportează; id inexistent → false', () => {
  localStorage.clear();
  Store.init();
  const { id } = Store.addNote({ title: 'de șters' });
  assert.equal(Store.deleteNote(id), true);
  assert.equal(Store.deleteNote(id), false);
  assert.deepEqual(Store.getNotes(), []);
});

test('subscribe: notificat la mutații; unsubscribe funcționează; erorile unui subscriber nu opresc ceilalți', () => {
  localStorage.clear();
  Store.init();
  let calls = 0;
  const bad = Store.subscribe(() => { throw new Error('subscriber defect'); });
  const unsub = Store.subscribe(() => { calls++; });
  Store.addNote({ title: 'notify' });
  assert.equal(calls, 1); // subscriber-ul defect nu a blocat notificarea
  unsub();
  bad();
  Store.addNote({ title: 'după unsub' });
  assert.equal(calls, 1);
});

test('clearAll + replaceNotes: adoptă note pre-validate, bypass rate limiter', () => {
  localStorage.clear();
  Store.init();
  Store.addNote({ title: 'veche' });
  Store.clearAll();
  assert.deepEqual(Store.getNotes(), []);
  Store.replaceNotes([
    { id: 'imp1', title: 'importată', content: '', tags: ['x'], createdAt: Date.now(), updatedAt: Date.now(), collapsed: false, isTask: false, done: false, isSun: false },
  ]);
  assert.equal(Store.getNotes().length, 1);
  assert.throws(() => Store.replaceNotes('nu-array'), TypeError);
});

test('exportJSON: round-trip prin parseAndValidateImport', async () => {
  localStorage.clear();
  Store.init();
  Store.addNote({ title: 'export me', tags: ['tag1'] });
  const json = Store.exportJSON();
  const { parseAndValidateImport } = await import('../security.js');
  const result = parseAndValidateImport(json);
  assert.equal(result.importedCount, 1);
  assert.equal(result.notes[0].title, 'export me');
});

/* ─── Limite (cap + rate limit) — ULTIMELE: epuizează limiterul global ─── */

test('addNote: cap NOTES_MAX_COUNT → SecurityError NOTES_CAP_REACHED', () => {
  localStorage.clear();
  Store.init();
  // Umplem la capacitate prin replaceNotes (bypass intenționat al limiterului)
  const bulk = Array.from({ length: LIMITS.NOTES_MAX_COUNT }, (_, i) => ({
    id: `bulk-${i}`, title: `n${i}`, content: '', tags: [],
    createdAt: Date.now(), updatedAt: Date.now(),
    collapsed: false, isTask: false, done: false, isSun: false,
  }));
  Store.replaceNotes(bulk);
  assert.throws(
    () => Store.addNote({ title: 'peste limită' }),
    (err) => err instanceof SecurityError && err.code === 'NOTES_CAP_REACHED'
  );
});

test('addNote: rate limiter → SecurityError RATE_LIMITED în interiorul ferestrei', () => {
  localStorage.clear();
  Store.init();
  // Limiterul e partajat pe modul (30/min) și a consumat deja câteva sloturi
  // în testele de mai sus — cerem doar ca refuzul să apară în ≤ 31 încercări.
  let threw = null;
  for (let i = 0; i < 31 && !threw; i++) {
    try {
      Store.addNote({ title: `spam ${i}` });
    } catch (err) {
      threw = err;
    }
  }
  assert.ok(threw instanceof SecurityError, 'așteptam SecurityError de rate limit');
  assert.equal(threw.code, 'RATE_LIMITED');
});
