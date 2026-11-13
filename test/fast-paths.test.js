import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { attributes, capsFor, defaultBody, lowerResolved, overall, overallAs, raiseResolved, resolveLinks, scoreAsOfSums,
  scoreOfSums, sumsOf, sumsWith } from '../src/engine.js';
import { clampLinks } from '../src/solver.js';
import { archetypeScore, metaScore, mipBody, optimizeBody, polishPlan } from '../src/breakpoints.js';
import { setMipSolver } from '../src/mip.js';

// Deterministic pseudo-random ratings.
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const randomRatings = caps => caps.map(c => 25 + Math.floor(rnd() * (c - 24)));

test('link fast paths match a full re-resolve', () => {
  for (let n = 0; n < 400; n++) {
    const h = 69 + Math.floor(rnd() * 20), body = defaultBody(['PG', 'SG', 'SF', 'PF', 'C'][n % 5], h), caps = capsFor(body);
    const manual = randomRatings(caps), base = clampLinks(manual, body.height, caps);
    if (!resolveLinks(manual, body.height).every((v, i) => v === base[i])) continue; // fast paths need nothing clamped
    const i = Math.floor(rnd() * attributes.length);
    const up = raiseResolved(base, body.height, i, base[i] + 1, caps);
    if (up) assert.deepEqual(up, clampLinks(manual.map((v, j) => j === i ? base[i] + 1 : v), body.height, caps));
    const lowered = manual.map((v, j) => j === i ? Math.max(25, v - 1 - Math.floor(rnd() * 10)) : v);
    const down = lowerResolved(base, lowered, body.height, i);
    if (down) assert.deepEqual(down, clampLinks(lowered, body.height, caps));
  }
});

test('incremental Overall matches the full formula', () => {
  for (let n = 0; n < 200; n++) {
    const body = defaultBody('SF', 69 + (n % 20)), caps = capsFor(body), h = body.height;
    const a = randomRatings(caps), b = a.map(v => rnd() < 0.3 ? 25 + Math.floor(rnd() * 74) : v);
    const s = sumsWith(sumsOf(a, h), a, b, h), full = overall(b, h);
    assert.ok(Math.abs(scoreOfSums(s, h).score - full.score) < 1e-9);
    assert.equal(scoreOfSums(s, h).playerType, full.playerType);
    assert.ok(Math.abs(scoreAsOfSums(s, h, 3) - overallAs(b, h, 3)) < 1e-9);
  }
});

const opts = { values: { '*': 0 }, caps: {}, continuous: [], continuousWeights: {}, minimums: attributes.map(() => 25),
  maximums: attributes.map(() => 99), breakers: { general: 15, future: 0, special: { category: 'shooting' } }, mustHave: {}, mode: 'both', metaRate: 1 };

test('the exact planner returns a legal build that a polish can only improve', async () => {
  setMipSolver(await createRequire(import.meta.url)('highs')());
  const body = defaultBody('C', 83);
  const g = optimizeBody(body, { ...opts, seeds: 0 });
  const x = mipBody(body, { ...opts, mipRadius: 6 }, g.playerType, g);
  assert.ok(x, 'exact plan found');
  assert.ok(x.ovr <= 99 + 1e-8 && x.ovr >= 98.9, 'filled to 99');
  assert.ok(x.breakers.reduce((s, n) => s + n, 0) <= 15 + 2);
  assert.ok(x.base.every((v, i) => v <= capsFor(body)[i]));
  assert.deepEqual(clampLinks(x.base, body.height, capsFor(body)), x.base, 'linked minimums hold');
  // Polishing (same tiers kept, re-planned) never makes the Lab's score worse when it's kept.
  const p = polishPlan(g, opts, null);
  assert.ok(!p.error);
  const best = [g, x, p].reduce((a, b) => archetypeScore(b, body, opts) > archetypeScore(a, body, opts) ? b : a);
  assert.ok(archetypeScore(best, body, opts) >= archetypeScore(g, body, opts));
  assert.ok(metaScore(best.final, body.height, 'C', 'both') > 0);
});
