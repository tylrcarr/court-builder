import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assess, attributes, capsFor, ladder, resolveLinks } from '../src/engine.js';
import { derive } from '../src/derive.js';
import { optimizeBody } from '../src/breakpoints.js';
import { satisfy, search } from '../src/solver.js';

// Cap Breaker gains depend on the player type, so a build can reach ratings that a planner starting from "every rating
// at base" (a different archetype) can't. Every one of these is a real build: searching the Lab with its own ratings as
// minimums and its breaker count must find it.
const findsItself = (build, general) => {
  const d = derive(build);
  const ctx = { body: build.body, h: build.body.height, caps: d.caps };
  const plan = satisfy(d.final, ctx, { general, special: { category: build.category ?? '', count: build.category ? 2 : 0 } });
  assert.ok(plan, 'breaker planner fits its ratings under 99');
  assert.ok(plan.final.every((v, i) => v >= d.final[i]));
  const r = optimizeBody(build.body, { mustHave: {}, minimums: d.final, continuous: [], values: { '*': 0 },
    breakers: { general, future: 0, special: { category: build.category ?? '' } } });
  assert.ok(!r.error, r.error);
  assert.ok(r.final.every((v, i) => v >= d.final[i]), 'Lab result meets every minimum');
};

test('a user build with 17 breakers (Driving Dunk, Vertical maxed through archetype 7) is found from its own ratings', () => {
  const build = { body: { position: 'SG', height: 78, weight: 195, wingspan: 84 },
    base: [25, 77, 88, 40, 25, 85, 83, 25, 80, 89, 84, 80, 82, 60, 80, 66, 82, 85, 83, 25, 77],
    breakers: [0, 0, 5, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 3, 0, 0, 0, 0, 0, 0, 5], category: 'shooting' };
  const d = derive(build);
  assert.equal(d.breakerCount, 17);
  assert.ok(d.state.score <= 99);
  findsItself(build, 17);
});

// 5 breakers on each of the 3 attributes that gain the most from them on this body, each taken to its cap. Lowering
// those bases can change the player type (and so the gains), so the bases are re-picked until the type settles.
// Linked minimums (e.g. offensive rebound held up by others) set how low a base can really go.
const linkedFloor = (base, i, height) => resolveLinks(base.map((v, j) => j === i ? 25 : v), height)[i];
const lowestBase = (i, caps, height, type, floor = 25) => {
  for (let b = floor; b <= caps[i]; b++) {
    const steps = ladder(i, b, caps[i], height, type).slice(0, 5), gain = steps.reduce((s, g) => s + g, 0);
    if (steps.length === 5 && steps.every(g => g > 0) && b + gain >= caps[i]) return { i, b, gain };
  }
  return { i, b: caps[i], gain: 0 };
};
function maxedThree(position, height) {
  const [r] = search({ positions: [position], heights: [height, height], limit: 1 }).results;
  const caps = capsFor(r.body), start = resolveLinks(r.manual, height);
  const picks = attributes.map((_, i) => lowestBase(i, caps, height, assess(start, height, caps).playerType, linkedFloor(start, i, height)))
    .sort((a, b) => b.gain - a.gain).slice(0, 3).map(p => p.i);
  let base = start;
  for (let round = 0; round < 6; round++) {
    const type = assess(resolveLinks(base, height), height, caps).playerType;
    const next = picks.reduce((v, i) => v.map((x, j) => j === i ? lowestBase(i, caps, height, type, linkedFloor(v, i, height)).b : x), base);
    if (next.every((v, j) => v === base[j])) break;
    base = next;
  }
  return { body: r.body, base, breakers: attributes.map((_, i) => picks.includes(i) ? 5 : 0) };
}

for (const [position, height] of [['SG', 78], ['PG', 74], ['C', 84], ['C', 86]]) {
  test(`${position} ${height}″ with 15 breakers maxing its 3 biggest-gain attributes is found from its own ratings`, () => {
    const build = maxedThree(position, height);
    const d = derive(build);
    assert.ok(d.state.fits);
    assert.equal(d.breakerCount, 15);
    findsItself(build, 15);
  });
}
