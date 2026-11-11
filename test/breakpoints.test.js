import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributes, badges, badgeTier, capsFor, lowerLinkedRatings, resolveLinks, assess, tiers } from '../src/engine.js';
import { autoFeel, bodiesFor, deadWeight, defaultPrefs, feelFor, heldTiers, liveFloors, optimizeAcross, optimizeBody, specMinimums,
  specUnlocked } from '../src/breakpoints.js';
import { decodeBuild } from '../src/share.js';
import { trimDeadWeight } from '../src/tune.js';
import { derive } from '../src/derive.js';

const rank = t => t ? tiers.indexOf(t) + 1 : 0;
import { DEFAULT_CONTINUOUS, goals } from '../src/breakpoints.js';
const byName = Object.fromEntries(goals.map(b => [b.name, b]));
const lovedBig = decodeBuild('A1OIWUpHWUA3RE5TWUZAUEgqVFleS0JUUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcC.shooting~');
const futureBig = decodeBuild('A1GQVRlBUhlUVVNAT1A9R0tTVFBaUExMUAAABQAAAgAAAQABAAAAAAAAAAAAAAcC.shooting~');
const opts = {
  values: { ...defaultPrefs().values, ankle_assassin: 0, handles_for_days: 0, pro_contact_off_two: 1 }, caps: { immovable_enforcer: 1 },
  continuous: ['speed', 'agility', 'ball_handle'],
  continuousWeights: { speed: 2, agility: 2 }, minimums: attributes.map(() => 25),
  breakers: { general: 7, future: 3, special: { category: 'shooting' } },
  mustHave: { boxout_boss: 'silver', set_and_fire: 'silver' },
};

function checkPlan(r, o = opts) {
  const caps = capsFor(r.body);
  const base = resolveLinks(r.manual, r.body.height).map((v, i) => Math.min(v, caps[i]));
  assert.ok(assess(base, r.body.height, caps).fits, 'within 99 and caps');
  assert.ok(r.final.every((v, i) => v <= caps[i]), 'breakers never pass caps');
  assert.ok(r.final.every((v, i) => v >= r.targets[i]), 'every target holds after fill');
  for (const [name, tier] of Object.entries(o.mustHave)) assert.ok(rank(badgeTier(byName[name], r.final, r.body.height)) >= rank(tier), name);
  assert.ok(specUnlocked('shooting', base), 'shooting specialization stays unlocked');
  assert.ok(r.specialCount <= 2);
  assert.equal(r.schedule.length, r.breakers.reduce((s, n) => s + n, 0));
  assert.ok(r.today.every((v, i) => v <= r.final[i] && v >= base[i]));
  const d = derive({ body: r.body, base: r.manual, breakers: r.breakers, category: r.category, specialCount: r.specialCount });
  assert.deepEqual(d.final, r.final, 'derive agrees with the optimizer');
}

test('optimizeBody meets must-haves, keeps specialization, and fits the budget', () => {
  checkPlan(optimizeBody(lovedBig.body, { ...opts, refine: true }));
});

test('optimizeBody never spends on badges marked don’t care', () => {
  const values = Object.fromEntries(goals.map(b => [b.name, b.discipline === 'rebounding' ? 1 : 0]));
  const r = optimizeBody(lovedBig.body, { ...opts, values, mustHave: {} });
  assert.ok(r.upgrades.every(u => u.attribute != null || byName[u.badge].discipline === 'rebounding'));
});

test('tier caps stop the optimizer paying past the worth-it tier', () => {
  const r = optimizeBody(lovedBig.body, { ...opts, mustHave: {} });
  assert.ok(r.upgrades.every(u => u.badge !== 'immovable_enforcer' || u.tier === 'bronze'));
});

test('leftover budget never pushes a base rating past 94', () => {
  const r = optimizeBody(lovedBig.body, { ...opts, mustHave: {}, minimums: attributes.map(() => 25) });
  const base = resolveLinks(r.manual, r.body.height);
  // Ratings above 94 must be targets (a breakpoint or minimum the solver chose), never leftover filler.
  assert.ok(base.every((v, i) => v <= 94 || v <= r.targets[i] || r.final[i] <= r.targets[i]));
});

test('driving dunkers treat handle and speed with ball as feel; rebounding stays breakpoint-only', () => {
  const dunker = attributes.map((_, i) => i === 2 ? 85 : 25);
  assert.deepEqual(autoFeel('C', attributes.map(() => 25)), []);
  assert.ok(autoFeel('SG', dunker).includes('speed_with_ball'));
  assert.ok(!feelFor({ continuous: [], notFeel: ['ball_handle'] }, 'PF', dunker).includes('ball_handle'));
});

test('optimizeAcross returns valid plans on several bodies', () => {
  const bodies = bodiesFor(['PF', 'C'], [82, 84], { around: lovedBig.body });
  const { results } = optimizeAcross(bodies, { ...opts, pinFirst: true }, { keep: 3 });
  assert.ok(results.length > 0);
  for (const r of results) checkPlan(r);
});

test('live floors keep every held tier', () => {
  const d = derive(lovedBig);
  const required = heldTiers(d.final, lovedBig.body.height, opts);
  const floors = liveFloors(d.final, lovedBig.body.height, { required, continuous: opts.continuous });
  for (const [name, r] of required) assert.ok(rank(badgeTier(byName[name], floors, lovedBig.body.height)) >= r, name);
  assert.ok(floors.every((v, i) => v <= d.final[i]));
});

test('trimming dead points never loses a valued tier and stays at 99', () => {
  for (const b of [lovedBig, futureBig]) {
    // The Builder's blank-Lab fallback: every badge Normal, standard feel list, no tier caps.
    const prefs = { ...defaultPrefs(), values: { '*': 1 }, caps: {}, continuous: [...DEFAULT_CONTINUOUS] };
    const before = derive(b);
    const after = derive({ ...b, base: trimDeadWeight(b, prefs).base });
    assert.ok(after.state.fits);
    for (const u of before.unlocked) assert.ok(rank(badgeTier(u.badge, after.final, b.body.height)) >= rank(u.tier), u.badge.name);
    assert.ok(deadWeight(after.final, b.body.height, prefs, b.category, after.ratings).slack
      .reduce((s, x) => s + x, 0) <= deadWeight(before.final, b.body.height, prefs, b.category, before.ratings).slack.reduce((s, x) => s + x, 0));
  }
});

test('specialized breakers only count once the specialization is unlocked', () => {
  const mins = specMinimums('shooting');
  assert.equal(mins[attributes.findIndex(a => a.name === 'mid_range')], 60);
  // Lower mid range the way the Builder does (linked minimums would otherwise pull it back up).
  const locked = { ...futureBig, base: lowerLinkedRatings(futureBig.base, futureBig.body.height, 5, 50) };
  assert.equal(derive(locked).specOk, false);
  assert.equal(derive(locked).specialUsed, 0);
  assert.equal(derive(futureBig).specOk, true);
});

test('archetype-forced breaker plans really land in that archetype and meet every target', async () => {
  const { satisfyAs } = await import('../src/solver.js');
  const { capsFor, defaultBody, overall, playerTypeCount } = await import('../src/engine.js');
  const body = defaultBody('C', 82), ctx = { body, h: 82, caps: capsFor(body) };
  const t = attributes.map(a => Math.min(ctx.caps[attributes.indexOf(a)], { three_point: 80, mid_range: 60, defensive_rebound: 90,
    block: 85, pass_accuracy: 75, speed: 70, vertical: 75, driving_dunk: 87 }[a.name] ?? 25));
  let found = 0;
  for (let type = 0; type < playerTypeCount(82); type++) {
    const p = satisfyAs(t, ctx, { general: 8, special: { category: 'shooting', count: 2 } }, type);
    if (!p) continue;
    found++;
    assert.equal(overall(p.base, 82).playerType, type);
    assert.ok(p.ovr <= 99 + 1e-8);
    p.final.forEach((v, i) => assert.ok(v >= t[i], attributes[i].name));
  }
  assert.ok(found > 1, 'more than one archetype is reachable');
});

test('blockers name the changes that make an empty search work', async () => {
  const { blockers, countFeasible } = await import('../src/breakpoints.js');
  const o = { values: { '*': 0 }, caps: {}, continuous: [], minimums: attributes.map(a => a.name === 'three_point' ? 85 : 25),
    breakers: { general: 8, future: 0, special: { category: 'shooting' } },
    mustHave: { possession_closer: 'gold', lightning_launch: 'silver', challenger: 'silver', break_starter: 'gold' } };
  assert.equal(countFeasible(['PF', 'C'], [82, 88], o), 0);
  const list = blockers(['PF', 'C'], [82, 88], o);
  assert.ok(list.length > 0);
  for (const x of list) {
    const fixed = x.changes.reduce((acc, c) => c.kind === 'must' ? { ...acc, mustHave: { ...acc.mustHave, [c.name]: c.to ?? undefined } }
      : { ...acc, minimums: acc.minimums.map((v, j) => j === c.index ? 25 : v) }, o);
    assert.equal(countFeasible(['PF', 'C'], [82, 88], fixed), x.count);
  }
});
