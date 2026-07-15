// Teste unitare pentru physics.js — simularea force-directed (Fruchterman-Reingold).
// Rulare: `node --test tests/`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSimulation,
  syncNodes,
  tick,
  getNode,
  setNodePosition,
  pinNode,
  reheat,
  resize,
  NODE_MAX_RADIUS,
} from '../physics.js';

const mkNote = (id) => ({ id, title: id, tags: [] });

test('createSimulation: stare inițială corectă', () => {
  const sim = createSimulation(800, 600);
  assert.equal(sim.width, 800);
  assert.equal(sim.height, 600);
  assert.equal(sim.alpha, 1);
  assert.equal(sim.nodes.size, 0);
});

test('createSimulation: params override DEFAULTS', () => {
  const sim = createSimulation(100, 100, { repulsion: 42 });
  assert.equal(sim.cfg.repulsion, 42);
  assert.ok(sim.cfg.damping > 0); // restul rămân din DEFAULTS
});

test('syncNodes: adaugă noduri noi aproape de centru, cu viteză 0', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a'), mkNote('b')]);
  assert.equal(sim.nodes.size, 2);
  const a = getNode(sim, 'a');
  assert.ok(Math.abs(a.x - 400) <= 40); // jitter ±40 în jurul centrului
  assert.equal(a.vx, 0);
  assert.equal(a.vy, 0);
});

test('syncNodes: elimină nodurile șterse, păstrează pozițiile existente', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a'), mkNote('b')]);
  const before = { ...getNode(sim, 'a') };
  syncNodes(sim, [mkNote('a')]);
  assert.equal(sim.nodes.size, 1);
  assert.equal(getNode(sim, 'a').x, before.x); // poziție intactă
  assert.equal(getNode(sim, 'b'), undefined);
});

test('syncNodes: schimbarea structurii resetează alpha la 1', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a')]);
  sim.alpha = 0.01;
  syncNodes(sim, [mkNote('a'), mkNote('b')]);
  assert.equal(sim.alpha, 1);
});

test('syncNodes: fără schimbări → alpha rămâne neschimbat', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a')]);
  sim.alpha = 0.5;
  syncNodes(sim, [mkNote('a')]);
  assert.equal(sim.alpha, 0.5);
});

test('tick: returnează false sub alphaMin (convergence early-out)', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a')]);
  sim.alpha = 0.001; // sub alphaMin (0.005)
  assert.equal(tick(sim, []), false);
});

test('tick: alpha scade la fiecare pas și nu coboară sub 0', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a'), mkNote('b')]);
  const a0 = sim.alpha;
  tick(sim, []);
  assert.ok(sim.alpha < a0);
  sim.alpha = 0.006;
  tick(sim, []);
  assert.ok(sim.alpha >= 0);
});

test('tick: repulsia depărtează două noduri apropiate', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a'), mkNote('b')]);
  const a = getNode(sim, 'a');
  const b = getNode(sim, 'b');
  a.x = 390; a.y = 300;
  b.x = 410; b.y = 300;
  const distBefore = Math.abs(b.x - a.x);
  tick(sim, []);
  const distAfter = Math.abs(b.x - a.x);
  assert.ok(distAfter > distBefore, `repulsie: ${distBefore} → ${distAfter}`);
});

test('tick: atracția pe muchie apropie noduri depărtate peste restLength', () => {
  const sim = createSimulation(2000, 2000, { centerForce: 0 }); // izolăm forța de arc
  syncNodes(sim, [mkNote('a'), mkNote('b')]);
  const a = getNode(sim, 'a');
  const b = getNode(sim, 'b');
  a.x = 200; a.y = 1000;
  b.x = 1800; b.y = 1000; // mult peste restLength=110
  const edges = [{ source: 'a', target: 'b', weight: 3, sharedTags: [] }];
  const distBefore = b.x - a.x;
  for (let i = 0; i < 10; i++) tick(sim, edges);
  const distAfter = b.x - a.x;
  assert.ok(distAfter < distBefore, `atracție: ${distBefore} → ${distAfter}`);
});

test('tick: viteza e limitată la maxVelocity', () => {
  const sim = createSimulation(800, 600, { repulsion: 1e9 }); // forță absurdă
  syncNodes(sim, [mkNote('a'), mkNote('b')]);
  const a = getNode(sim, 'a');
  const b = getNode(sim, 'b');
  a.x = 300; a.y = 300;
  b.x = 302; b.y = 300;
  tick(sim, []);
  const v = Math.hypot(a.vx, a.vy);
  assert.ok(v <= sim.cfg.maxVelocity + 1e-9, `|v|=${v} ≤ ${sim.cfg.maxVelocity}`);
});

test('tick: nodurile pinned nu sunt integrate', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a'), mkNote('b')]);
  const a = getNode(sim, 'a');
  a.x = 100; a.y = 100;
  pinNode(sim, 'a', true);
  tick(sim, []);
  assert.equal(a.x, 100);
  assert.equal(a.y, 100);
});

test('setNodePosition: clamp la marginile viewport-ului cu NODE_MAX_RADIUS', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a')]);
  setNodePosition(sim, 'a', -50, 9999);
  const a = getNode(sim, 'a');
  assert.equal(a.x, NODE_MAX_RADIUS);
  assert.equal(a.y, 600 - NODE_MAX_RADIUS);
  assert.equal(a.vx, 0); // drag resetează viteza
});

test('setNodePosition: id inexistent → no-op fără crash', () => {
  const sim = createSimulation(800, 600);
  setNodePosition(sim, 'ghost', 10, 10);
  assert.equal(sim.nodes.size, 0);
});

test('reheat: crește alpha dar nu-l scade niciodată', () => {
  const sim = createSimulation(800, 600);
  sim.alpha = 0.1;
  reheat(sim, 0.5);
  assert.equal(sim.alpha, 0.5);
  reheat(sim, 0.2); // mai mic decât actualul → păstrează 0.5
  assert.equal(sim.alpha, 0.5);
});

test('resize: scalează pozițiile proporțional și trezește simularea', () => {
  const sim = createSimulation(800, 600);
  syncNodes(sim, [mkNote('a')]);
  const a = getNode(sim, 'a');
  a.x = 400; a.y = 300; // exact centrul
  sim.alpha = 0;
  resize(sim, 1600, 1200);
  assert.equal(a.x, 800);  // proporția păstrată (dublul)
  assert.equal(a.y, 600);
  assert.equal(sim.width, 1600);
  assert.ok(sim.alpha >= 0.3); // reheat(0.3)
});
