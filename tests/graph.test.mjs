// Teste unitare pentru graph.js — algoritmii puri de graf.
// Rulare: `node --test tests/` (zero dependențe — runner-ul nativ Node).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEdges,
  buildAdjacency,
  connectedComponent,
  allConnectedComponents,
  nodesWithTag,
  getTagFrequency,
  buildGraphModel,
  describeNode,
} from '../graph.js';

/** Helper: notă minimă pentru testele de graf. */
const mkNote = (id, tags = [], extra = {}) => ({ id, title: id, tags, ...extra });

test('buildEdges: sub 2 notițe → fără muchii', () => {
  assert.deepEqual(buildEdges([]), []);
  assert.deepEqual(buildEdges([mkNote('a', ['x'])]), []);
  assert.deepEqual(buildEdges(null), []);
});

test('buildEdges: tag comun → o muchie cu weight 1', () => {
  const edges = buildEdges([mkNote('a', ['js']), mkNote('b', ['js'])]);
  assert.equal(edges.length, 1);
  assert.deepEqual(edges[0], { source: 'a', target: 'b', weight: 1, sharedTags: ['js'] });
});

test('buildEdges: două tag-uri comune → weight 2, sharedTags sortate', () => {
  const edges = buildEdges([mkNote('a', ['zeta', 'alfa']), mkNote('b', ['alfa', 'zeta'])]);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].weight, 2);
  assert.deepEqual(edges[0].sharedTags, ['alfa', 'zeta']); // sortare deterministă
});

test('buildEdges: ordonare canonică source < target indiferent de ordinea input', () => {
  const edges = buildEdges([mkNote('zzz', ['t']), mkNote('aaa', ['t'])]);
  assert.equal(edges[0].source, 'aaa');
  assert.equal(edges[0].target, 'zzz');
});

test('buildEdges: tag deținut de o singură notiță nu produce muchii', () => {
  const edges = buildEdges([mkNote('a', ['unic']), mkNote('b', ['altul'])]);
  assert.equal(edges.length, 0);
});

test('buildEdges: notițe fără tags array sunt ignorate fără crash', () => {
  const edges = buildEdges([mkNote('a', ['t']), { id: 'b', tags: null }, mkNote('c', ['t'])]);
  assert.equal(edges.length, 1);
  assert.deepEqual([edges[0].source, edges[0].target], ['a', 'c']);
});

test('buildAdjacency: muchia e neorientată (ambele direcții)', () => {
  const adj = buildAdjacency([{ source: 'a', target: 'b', weight: 1, sharedTags: ['t'] }]);
  assert.ok(adj.get('a').has('b'));
  assert.ok(adj.get('b').has('a'));
});

test('connectedComponent: BFS găsește toată componenta, nu și restul', () => {
  // lanț a-b-c + nod izolat d
  const notes = [mkNote('a', ['t1']), mkNote('b', ['t1', 't2']), mkNote('c', ['t2']), mkNote('d', ['solo'])];
  const adj = buildAdjacency(buildEdges(notes));
  const comp = connectedComponent('a', adj);
  assert.deepEqual([...comp].sort(), ['a', 'b', 'c']);
});

test('connectedComponent: nod fără muchii → componenta e doar el', () => {
  const comp = connectedComponent('x', new Map());
  assert.deepEqual([...comp], ['x']);
});

test('allConnectedComponents: enumeră toate componentele o singură dată', () => {
  const notes = [mkNote('a', ['t1']), mkNote('b', ['t1']), mkNote('c', ['t2']), mkNote('d', ['t2']), mkNote('e')];
  const adj = buildAdjacency(buildEdges(notes));
  const comps = allConnectedComponents(notes, adj);
  assert.equal(comps.length, 3); // {a,b}, {c,d}, {e}
  const sizes = comps.map((c) => c.size).sort();
  assert.deepEqual(sizes, [1, 2, 2]);
});

test('nodesWithTag: normalizează tag-ul (trim + lowercase)', () => {
  const notes = [mkNote('a', ['js']), mkNote('b', ['py'])];
  assert.deepEqual([...nodesWithTag(notes, '  JS ')], ['a']);
  assert.equal(nodesWithTag(notes, '').size, 0);
  assert.equal(nodesWithTag(notes, null).size, 0);
});

test('getTagFrequency: sortare descendentă după count, apoi alfabetic', () => {
  const notes = [mkNote('a', ['b-tag', 'a-tag']), mkNote('b', ['b-tag']), mkNote('c', ['a-tag'])];
  const freq = getTagFrequency(notes);
  // ambele au count 2 → ordine alfabetică
  assert.deepEqual(freq, [
    { tag: 'a-tag', count: 2 },
    { tag: 'b-tag', count: 2 },
  ]);
});

test('buildGraphModel: soarele unui lanț a-b-c este centroidul b', () => {
  const notes = [mkNote('a', ['t1']), mkNote('b', ['t1', 't2']), mkNote('c', ['t2'])];
  const model = buildGraphModel(notes);
  assert.deepEqual([...model.sunIds], ['b']);
  assert.equal(model.depths.get('b'), 0);
  assert.equal(model.depths.get('a'), 1);
  assert.equal(model.depths.get('c'), 1);
});

test('buildGraphModel: centroid pe lanț de 5 → nodul din mijloc', () => {
  // lanț a-b-c-d-e prin tag-uri unice per muchie
  const notes = [
    mkNote('a', ['e1']),
    mkNote('b', ['e1', 'e2']),
    mkNote('c', ['e2', 'e3']),
    mkNote('d', ['e3', 'e4']),
    mkNote('e', ['e4']),
  ];
  const model = buildGraphModel(notes);
  assert.deepEqual([...model.sunIds], ['c']);
  assert.equal(model.depths.get('a'), 2);
  assert.equal(model.depths.get('e'), 2);
});

test('buildGraphModel: sunOverrideId promovează nodul selectat ca soare', () => {
  const notes = [mkNote('a', ['t1']), mkNote('b', ['t1', 't2']), mkNote('c', ['t2'])];
  const model = buildGraphModel(notes, 'a');
  assert.ok(model.sunIds.has('a'));
  assert.equal(model.depths.get('a'), 0);
  assert.equal(model.depths.get('c'), 2); // a→b→c
});

test('buildGraphModel: isSun=true (pinned) are prioritate peste centroid', () => {
  const notes = [
    mkNote('a', ['t1']),
    mkNote('b', ['t1', 't2']),
    mkNote('c', ['t2'], { isSun: true }),
  ];
  const model = buildGraphModel(notes);
  assert.ok(model.sunIds.has('c'));
});

test('buildGraphModel: sunOverrideId bate și pinned isSun', () => {
  const notes = [
    mkNote('a', ['t1']),
    mkNote('b', ['t1', 't2']),
    mkNote('c', ['t2'], { isSun: true }),
  ];
  const model = buildGraphModel(notes, 'a');
  assert.ok(model.sunIds.has('a'));
  assert.ok(!model.sunIds.has('c'));
});

test('buildGraphModel: nodurile collapsed sunt excluse din alegerea centroidului', () => {
  // b ar fi centroidul lanțului a-b-c, dar e collapsed → soarele devine a sau c
  const notes = [
    mkNote('a', ['t1']),
    mkNote('b', ['t1', 't2'], { collapsed: true }),
    mkNote('c', ['t2']),
  ];
  const model = buildGraphModel(notes);
  assert.ok(!model.sunIds.has('b'));
});

test('buildGraphModel: collapsed pe soarele pinned ascunde toți descendenții BFS', () => {
  // isSun=true are prioritate peste excluderea collapsed → b rămâne soare
  const notes = [
    mkNote('a', ['t1']),
    mkNote('b', ['t1', 't2'], { collapsed: true, isSun: true }),
    mkNote('c', ['t2']),
  ];
  const model = buildGraphModel(notes);
  assert.ok(model.sunIds.has('b'));
  assert.ok(model.hiddenIds.has('a'));
  assert.ok(model.hiddenIds.has('c'));
  assert.ok(!model.hiddenIds.has('b')); // nodul colapsat rămâne vizibil, copiii dispar
});

test('buildGraphModel: noduri izolate primesc depth 0 și zero copii', () => {
  const notes = [mkNote('solo')];
  const model = buildGraphModel(notes);
  assert.equal(model.depths.get('solo'), 0);
  assert.equal(model.childCounts.get('solo'), 0);
  assert.equal(model.bfsParent.get('solo'), null);
  assert.ok(model.sunIds.has('solo'));
});

test('buildGraphModel: componentIndexById mapează fiecare nod la componenta sa', () => {
  const notes = [mkNote('a', ['t1']), mkNote('b', ['t1']), mkNote('c', ['t2']), mkNote('d', ['t2'])];
  const model = buildGraphModel(notes);
  assert.equal(model.componentIndexById.get('a'), model.componentIndexById.get('b'));
  assert.equal(model.componentIndexById.get('c'), model.componentIndexById.get('d'));
  assert.notEqual(model.componentIndexById.get('a'), model.componentIndexById.get('c'));
});

test('describeNode: context complet pentru o planetă', () => {
  const notes = [mkNote('a', ['t1']), mkNote('b', ['t1', 't2']), mkNote('c', ['t2'])];
  const model = buildGraphModel(notes);
  const d = describeNode('a', model);
  assert.equal(d.title, 'a');
  assert.equal(d.isSun, false);
  assert.equal(d.sunTitle, 'b');
  assert.equal(d.componentSize, 3);
  assert.equal(d.neighborCount, 1);
  assert.deepEqual(d.neighbors[0], { title: 'b', sharedTags: ['t1'] });
});

test('describeNode: soarele își cunoaște statutul; nod izolat fără vecini', () => {
  const notes = [mkNote('a', ['t1']), mkNote('b', ['t1']), mkNote('solo')];
  const model = buildGraphModel(notes);
  const suns = [...model.sunIds].filter((id) => id !== 'solo');
  const sun = describeNode(suns[0], model);
  assert.equal(sun.isSun, true);
  assert.equal(sun.sunTitle, null);
  const solo = describeNode('solo', model);
  assert.equal(solo.neighborCount, 0);
  assert.equal(describeNode('inexistent', model), null);
});
