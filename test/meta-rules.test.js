import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributes, capsFor } from '../src/engine.js';
import { metaScore, nearOf, nudgeBodies } from '../src/breakpoints.js';
import { reboundGate } from '../src/meta.js';

const ix = n => attributes.findIndex(a => a.name === n);
const flat = v => attributes.map(() => v);

test('bigs (and tall non-handlers) are punished hard for a low defensive rebound', () => {
  assert.equal(reboundGate(90, 'C', 83, 60), 1);
  assert.ok(reboundGate(70, 'C', 83, 60) <= 0.56, '70 board on a C');
  assert.ok(reboundGate(70, 'SF', 82, 50) < 1, "6'10\" SF who doesn't handle");
  assert.equal(reboundGate(60, 'SG', 76, 50), 1, 'guards are not');
  const f = flat(80); f[ix('three_point')] = 80;
  const lo = [...f]; lo[ix('defensive_rebound')] = 70;
  assert.ok(metaScore(f, 83, 'C') > metaScore(lo, 83, 'C') * 1.4);
});

test('93 driving dunk is a cliff; 94-98 add nothing', () => {
  const f = flat(80); f[ix('vertical')] = 85;
  const at = v => { const g = [...f]; g[ix('driving_dunk')] = v; return metaScore(g, 80, 'SF'); };
  assert.ok(at(93) - at(92) > 1.5);
  assert.ok(at(95) - at(93) < 0.05);
});

test('a badge tier one Cap Breaker away counts for part of its worth, less with fewer breakers left', () => {
  const body = { position: 'C', height: 83, weight: 250, wingspan: 88 };
  const base = flat(70); base[ix('strength')] = 82; base[ix('three_point')] = 80;
  const r = { body, base, breakers: attributes.map(() => 0), playerType: null, final: base };
  const plain = metaScore(base, 83, 'C'), near = metaScore(base, 83, 'C', '5v5', nearOf(r));
  assert.ok(near > plain, 'Brick Wall silver (83 strength) is one breaker away');
  const used = { ...nearOf(r), used: 26 };
  assert.ok(metaScore(base, 83, 'C', '5v5', used) < near, 'fewer breakers left, less credit');
});

test('weight nudges open a breakpoint the build just misses', () => {
  const body = { position: 'C', height: 83, weight: 222, wingspan: 85 };
  const final = flat(70); final[ix('defensive_rebound')] = capsFor(body)[ix('defensive_rebound')];
  const out = nudgeBodies({ body, final }, 4);
  assert.ok(out.length > 0);
  for (const n of out) for (const o of n.opens) assert.ok(capsFor(n.body)[o.i] >= o.m && capsFor(body)[o.i] < o.m);
});

test('Post Fade Phenom is worth nothing at bronze', () => {
  const f = flat(60); f[ix('three_point')] = 80;
  const g = [...f]; g[ix('post_control')] = 56; // bronze needs 55 post / 60 mid
  assert.ok(Math.abs(metaScore(g, 80, 'SF') - metaScore(f, 80, 'SF')) < 0.01);
});
