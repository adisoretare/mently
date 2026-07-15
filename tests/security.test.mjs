// Teste unitare pentru security.js — stratul de sanitizare/validare (Cap. V).
// Acoperă vectorii de atac documentați: XSS, prototype pollution, Unicode Trojan,
// import DoS, rate limiting. Rulare: `node --test tests/`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  LIMITS,
  SecurityError,
  escapeHtml,
  sanitizeText,
  sanitizeTitle,
  sanitizeContent,
  isValidTag,
  sanitizeTag,
  sanitizeTags,
  isValidId,
  validateNote,
  parseAndValidateImport,
  createRateLimiter,
  generateId,
} from '../security.js';

/* ─── escapeHtml ─── */

test('escapeHtml: toate cele 8 entități din mapă', () => {
  assert.equal(
    escapeHtml(`&<>"'/\`=`),
    '&amp;&lt;&gt;&quot;&#39;&#x2F;&#x60;&#x3D;'
  );
});

test('escapeHtml: payload XSS clasic devine inert', () => {
  const out = escapeHtml('<script>alert(1)</script>');
  assert.ok(!out.includes('<script'));
  assert.equal(out, '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
});

test('escapeHtml: null/undefined → string gol; non-string coerce', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

/* ─── sanitizeText ─── */

test('sanitizeText: elimină control chars, păstrează \\t \\n \\r', () => {
  assert.equal(sanitizeText('a\x00b\x08c'), 'abc');
  assert.equal(sanitizeText('a\tb\nc'), 'a\tb\nc');
});

test('sanitizeText: elimină zero-width și directional overrides (Unicode Trojan)', () => {
  // ​ zero-width space, ‮ RTL override, ﻿ BOM, ⁦/⁩ directional isolates
  assert.equal(sanitizeText('a​b‮c﻿d'), 'abcd');
  assert.equal(sanitizeText('x⁦y⁩z'), 'xyz');
});

test('sanitizeText: trim + trunchiere la maxLength', () => {
  assert.equal(sanitizeText('  salut  '), 'salut');
  assert.equal(sanitizeText('abcdef', 3), 'abc');
});

test('sanitizeTitle/sanitizeContent: respectă limitele din LIMITS', () => {
  assert.equal(sanitizeTitle('x'.repeat(500)).length, LIMITS.TITLE_MAX_LENGTH);
  assert.equal(sanitizeContent('x'.repeat(20_000)).length, LIMITS.CONTENT_MAX_LENGTH);
});

/* ─── taguri ─── */

test('sanitizeTag: normalizare lowercase + trim; diacritice acceptate', () => {
  assert.equal(sanitizeTag('  JavaScript '), 'javascript');
  assert.equal(sanitizeTag('învățare'), 'învățare');
});

test('sanitizeTag: respinge tag-uri invalide', () => {
  assert.equal(sanitizeTag('<img>'), null);
  assert.equal(sanitizeTag('-începe-cu-cratimă'), null);
  assert.equal(sanitizeTag(''), null);
  assert.equal(sanitizeTag(42), null);
});

test('sanitizeTags: dedupe + cap la TAGS_MAX_COUNT', () => {
  const tags = sanitizeTags(['js', 'JS', 'js ', 'py']);
  assert.deepEqual(tags, ['js', 'py']);
  const many = sanitizeTags(Array.from({ length: 30 }, (_, i) => `tag${i}`));
  assert.equal(many.length, LIMITS.TAGS_MAX_COUNT);
});

test('isValidTag/isValidId: contracte de bază', () => {
  assert.equal(isValidTag('abc-123'), true);
  assert.equal(isValidTag('ABC'), false); // doar lowercase după normalizare
  assert.equal(isValidId('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isValidId('id cu spații'), false);
  assert.equal(isValidId('x'.repeat(100)), false);
  assert.equal(isValidId(''), false);
  assert.equal(isValidId(null), false);
});

/* ─── validateNote: prototype pollution + schema ─── */

test('validateNote: notă validă trece, câmpurile sunt normalizate', () => {
  const note = validateNote({ id: 'abc', title: '  Titlu  ', content: 'text', tags: ['JS'], done: 1 });
  assert.equal(note.title, 'Titlu');
  assert.deepEqual(note.tags, ['js']);
  assert.equal(note.done, true);
});

test('validateNote: __proto__ ca own property (vectorul JSON.parse) → respins', () => {
  const raw = JSON.parse('{"title": "ok", "__proto__": {"isAdmin": true}}');
  assert.equal(validateNote(raw), null);
});

test('validateNote: cheia constructor → respins', () => {
  const raw = JSON.parse('{"title": "ok", "constructor": {"prototype": {}}}');
  assert.equal(validateNote(raw), null);
});

test('validateNote: prototype modificat efectiv → respins', () => {
  const evil = Object.create({ polluted: true });
  evil.title = 'ok';
  assert.equal(validateNote(evil), null);
});

test('validateNote: fără titlu / non-obiect / array → null', () => {
  assert.equal(validateNote({ content: 'fără titlu' }), null);
  assert.equal(validateNote('string'), null);
  assert.equal(validateNote([1, 2]), null);
  assert.equal(validateNote(null), null);
});

test('validateNote: timestamp în afara ferestrei 1980-2100 → înlocuit cu Date.now()', () => {
  const before = Date.now();
  const note = validateNote({ title: 'ok', createdAt: 123, updatedAt: 99999999999999 });
  assert.ok(note.createdAt >= before);
  assert.ok(note.updatedAt >= before);
});

test('validateNote: id invalid → null (caller generează unul nou)', () => {
  const note = validateNote({ title: 'ok', id: '<script>' });
  assert.equal(note.id, null);
});

/* ─── parseAndValidateImport ─── */

test('parseAndValidateImport: non-string / gol → SecurityError', () => {
  assert.throws(() => parseAndValidateImport(42), SecurityError);
  assert.throws(() => parseAndValidateImport(''), SecurityError);
});

test('parseAndValidateImport: payload peste limita de bytes → refuzat înainte de parse', () => {
  const big = 'x'.repeat(LIMITS.JSON_IMPORT_MAX_BYTES + 1);
  assert.throws(() => parseAndValidateImport(big), SecurityError);
});

test('parseAndValidateImport: JSON malformat → SecurityError, nu crash', () => {
  assert.throws(() => parseAndValidateImport('{invalid'), SecurityError);
});

test('parseAndValidateImport: schema invalidă (notes lipsă / non-array)', () => {
  assert.throws(() => parseAndValidateImport('{"foo": 1}'), SecurityError);
  assert.throws(() => parseAndValidateImport('{"notes": "nu-array"}'), SecurityError);
  assert.throws(() => parseAndValidateImport('[1,2]'), SecurityError);
});

test('parseAndValidateImport: payload cu __proto__ la rădăcină → respins', () => {
  assert.throws(
    () => parseAndValidateImport('{"notes": [], "__proto__": {"x": 1}}'),
    SecurityError
  );
});

test('parseAndValidateImport: peste NOTES_MAX_COUNT → respins', () => {
  const notes = JSON.stringify({ notes: Array.from({ length: 1001 }, (_, i) => ({ title: `n${i}` })) });
  assert.throws(() => parseAndValidateImport(notes), SecurityError);
});

test('parseAndValidateImport: notele invalide sunt sărite, nu strică importul', () => {
  const payload = JSON.stringify({
    notes: [
      { title: 'valid 1' },
      { content: 'fără titlu — invalid' },
      { title: 'valid 2', tags: ['ok'] },
    ],
  });
  const result = parseAndValidateImport(payload);
  assert.equal(result.importedCount, 2);
  assert.equal(result.skippedCount, 1);
  assert.ok(result.notes.every((n) => n.id)); // id-uri generate acolo unde lipseau
});

/* ─── rate limiter ─── */

test('createRateLimiter: permite maxCalls, apoi refuză', () => {
  const lim = createRateLimiter(3, 60_000);
  assert.equal(lim.tryAcquire(), true);
  assert.equal(lim.tryAcquire(), true);
  assert.equal(lim.tryAcquire(), true);
  assert.equal(lim.tryAcquire(), false);
  assert.equal(lim.remaining(), 0);
});

test('createRateLimiter: reset() golește fereastra', () => {
  const lim = createRateLimiter(1, 60_000);
  lim.tryAcquire();
  assert.equal(lim.tryAcquire(), false);
  lim.reset();
  assert.equal(lim.tryAcquire(), true);
});

test('createRateLimiter: fereastra glisantă expiră marcajele vechi', async () => {
  const lim = createRateLimiter(1, 40); // fereastră de 40ms
  assert.equal(lim.tryAcquire(), true);
  assert.equal(lim.tryAcquire(), false);
  await sleep(60);
  assert.equal(lim.tryAcquire(), true); // marcajul vechi a expirat
});

/* ─── generateId ─── */

test('generateId: format UUID v4 și unicitate pe eșantion', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const ids = new Set(Array.from({ length: 100 }, generateId));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, re);
});
