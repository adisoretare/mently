// Teste unitare pentru search.js — căutare insensibilă la diacritice + highlight sigur.
// Rulare: `node --test tests/`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, foldWithMap, noteMatches, filterNotes, matchRanges, highlightHtml } from '../search.js';
import { escapeHtml } from '../security.js';

const mkNote = (title, content = '', tags = []) => ({ id: title, title, content, tags });

test('fold: elimină diacriticele românești și face lowercase', () => {
  assert.equal(fold('Învățare'), 'invatare');
});

test('fold: mapare exactă pentru toate diacriticele românești', () => {
  assert.equal(fold('ă'), 'a');
  assert.equal(fold('â'), 'a');
  assert.equal(fold('î'), 'i');
  assert.equal(fold('ș'), 's');
  assert.equal(fold('ț'), 't');
  assert.equal(fold('Ș'), 's');
  assert.equal(fold('null'), 'null');
  assert.equal(fold(null), '');
});

test('foldWithMap: map[i] indică originea fiecărui caracter folded', () => {
  const { folded, map } = foldWithMap('ăBc');
  assert.equal(folded, 'abc');
  assert.deepEqual(map, [0, 1, 2]);
});

test('noteMatches: query fără diacritice găsește text cu diacritice și invers', () => {
  const note = mkNote('Învățare automată', 'despre rețele neuronale', ['știință']);
  assert.equal(noteMatches(note, 'invatare'), true);
  assert.equal(noteMatches(note, 'ÎNVĂȚARE'), true);
  assert.equal(noteMatches(note, 'retele'), true);   // conținut
  assert.equal(noteMatches(note, 'stiinta'), true);  // tag
  assert.equal(noteMatches(note, 'chimie'), false);
  assert.equal(noteMatches(note, ''), true); // query gol → match universal
});

test('filterNotes: query gol returnează lista intactă', () => {
  const notes = [mkNote('a'), mkNote('b')];
  assert.equal(filterNotes(notes, '  '), notes);
  assert.equal(filterNotes(notes, 'a').length, 1);
});

test('matchRanges: intervale corecte în textul original, inclusiv peste diacritice', () => {
  assert.deepEqual(matchRanges('abcabc', 'b'), [[1, 2], [4, 5]]);
  // "învățare": căutăm "vata" — trebuie să acopere v-ă-ț-a din original
  assert.deepEqual(matchRanges('învățare', 'vata'), [[2, 6]]);
  assert.deepEqual(matchRanges('text', 'lipsă'), []);
});

test('highlightHtml: învelește match-urile în <mark>, escape-uind fiecare segment', () => {
  assert.equal(highlightHtml('abc', 'b', escapeHtml), 'a<mark>b</mark>c');
  assert.equal(highlightHtml('învățare', 'vata', escapeHtml), 'în<mark>văța</mark>re');
});

test('highlightHtml: XSS în text sau query rămâne inert', () => {
  const out = highlightHtml('<script>alert(1)</script>', 'script', escapeHtml);
  assert.ok(!out.includes('<script'));
  assert.ok(out.includes('<mark>script</mark>'));
  // query ostil nu injectează nimic (e doar căutat, nu inserat)
  const out2 = highlightHtml('text', '<img onerror=x>', escapeHtml);
  assert.equal(out2, 'text');
});

test('highlightHtml: fără match → doar escape', () => {
  assert.equal(highlightHtml('a & b', 'zzz', escapeHtml), 'a &amp; b');
});
