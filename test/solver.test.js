import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assess, attributes, badges, badgeTier, capsFor, resolveLinks, tiers } from '../src/engine.js';
import { search } from '../src/solver.js';
import { maximizeBadges } from '../src/tune.js';
import { parseVibes, vibesToSearch } from '../src/vibes.js';
import { derive } from '../src/ui/derive.js';

const badge = name => badges.find(b => b.name === name);
const filledTo99 = (base, body) => {
  const caps = capsFor(body), ratings = resolveLinks(base, body.height);
  return assess(ratings, body.height, caps).fits && ratings.every((r, i) => r >= caps[i]
    || !assess(resolveLinks(base.map((v, j) => j === i ? r + 1 : v), body.height), body.height, caps).fits);
};

test('every Lab result meets the requested badge tiers and is filled to 99', () => {
  const goals = [{ badge: badge('limitless_range'), tier: 'silver' }, { badge: badge('boxout_boss'), tier: 'gold' }];
  const { results } = search({ positions: ['PF', 'C'], badgeGoals: goals, breakers: { general: 6, special: { category: '', count: 0 } }, limit: 6 });
  assert.ok(results.length > 0);
  for (const r of results) {
    const d = derive({ body: r.body, base: r.manual, breakers: r.breakers });
    for (const g of goals) assert.ok(tiers.indexOf(badgeTier(g.badge, d.final, r.body.height)) >= tiers.indexOf(g.tier), g.badge.name);
    assert.ok(filledTo99(r.manual, r.body), `${r.body.position} ${r.body.height} not filled`);
    assert.ok(d.final.every((v, i) => v <= d.caps[i]), 'breakers never pass caps');
  }
});

test('badge maximizer never loses a badge tier and stays at 99', () => {
  const [r] = search({ positions: ['SG'], heights: [77, 77], limit: 1 }).results;
  const build = { body: r.body, base: r.manual, breakers: r.breakers };
  const before = derive(build);
  const { build: after, points } = maximizeBadges(build, attributes.map(() => false), { rounds: 10 });
  const d = derive(after);
  assert.ok(points >= before.badgePoints);
  for (const u of before.unlocked) assert.ok(tiers.indexOf(badgeTier(u.badge, d.final, r.body.height)) >= tiers.indexOf(u.tier), u.badge.name);
  assert.ok(d.state.fits);
});

test('vibes parse plain language, including typos and intensity words', () => {
  const sel = parseVibes('I want to shoot, score inside with close shot, rebound and pass with good speed and gility and perimeter defense');
  assert.deepEqual(Object.keys(sel).sort(), ['agility', 'closeshot', 'passing', 'perimeterd', 'rebounding', 'sniper', 'speed']);
  assert.deepEqual(parseVibes('elite lockdown defender who can knock down threes and some rebounding'),
    { perimeterd: 'elite', sniper: 'elite', rebounding: 'nice' });
  const { weights } = vibesToSearch(sel);
  assert.ok(weights[attributes.find(a => a.name === 'agility').index] > 1);
});

test('share links round-trip a build', async () => {
  globalThis.btoa ??= s => Buffer.from(s, 'binary').toString('base64');
  globalThis.atob ??= s => Buffer.from(s, 'base64').toString('binary');
  const { encodeBuild, decodeBuild } = await import('../src/share.js');
  const b = { body: { position: 'C', height: 83, weight: 255, wingspan: 89 }, base: attributes.map((_, i) => 25 + i * 3),
    breakers: attributes.map((_, i) => i % 6), budget: 8, category: 'shooting', specialCount: 2, title: 'Glass & Range' };
  const back = decodeBuild(encodeBuild(b));
  assert.deepEqual({ ...back }, { ...b, body: b.body, specialCount: 2, category: 'shooting', title: 'Glass & Range' });
});
