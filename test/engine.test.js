import assert from 'node:assert/strict';
import { test } from 'node:test';
import data from './fixtures.json' with { type: 'json' };
import rules from '../src/rules.json' with { type: 'json' };
import { assess, attributes, badges, badgeTier, capsFor, empty, ladder, lowerLinkedRatings, overall, resolveLinks } from '../src/engine.js';
import { optimize } from '../src/optimizer.js';

const bodyFor = body => ({ height: body.heightInches, weight: body.weightLb, wingspan: body.wingspanInches });
const vector = ratings => rules.caps.attributeOrder.map(key => ratings[key]);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} vs ${expected}`);

test('native OVR math matches 256 mixed and 75 uniform 2K HQ vectors', () => {
  for (const row of data.mixed) {
    const result = overall(row.values, 75);
    close(result.score, row.uncapped);
    assert.equal(result.playerType, row.uncapped_player_type);
  }
  for (const row of data.uniform) close(Math.min(99, overall(empty().fill(row.rating), 75).score), row.detailed);
});

test('reference frame ceilings match all 21 HQ caps', () => {
  assert.deepEqual(capsFor({ height:75, weight:198, wingspan:78 }), data.caps.map(row => row.cap));
});

test('replays both published Build Lab affordability boundaries', () => {
  for (const [index, fixture] of data.boundaries.entries()) {
    const body = bodyFor(fixture.body), caps = capsFor(body);
    assert.ok(assess(vector(fixture.ratings), body.height, caps).fits);
    for (const key of index === 0 ? ['Strength', 'Vertical'] : ['Speed']) {
      const ratings = { ...fixture.ratings, [key]: fixture.ratings[key] + 1 };
      assert.ok(!assess(vector(ratings), body.height, caps).fits);
    }
  }
});

test('replays all visible sequential HQ Cap Breaker gains', () => {
  const fixture = data.breakers;
  const body = bodyFor(fixture.body), caps = capsFor(body), ratings = vector(fixture.startingRatings);
  const type = assess(ratings, body.height, caps).playerType;
  for (const [key, expected] of Object.entries(fixture.expectedSequences)) {
    const i = rules.caps.attributeOrder.indexOf(key);
    assert.deepEqual(ladder(i, ratings[i], caps[i], body.height, type), expected, key);
  }
});

test('search honors linked floors, badge gates and restricted breaker budget', () => {
  const body = { height:78, weight:212, wingspan:82 };
  const goals = empty();
  goals[6] = 85;
  const badge = badges.find(item => item.name === 'posterizer');
  const { results } = optimize({ body, goals, badgeGoals:[{badge,tier:'silver'}], budget:1,
    specialization:{category:'shooting',count:2}, attributes });
  assert.ok(results.length);
  for (const result of results) {
    assert.deepEqual(result.base, resolveLinks(result.seed, body.height));
    assert.ok(result.final[6] >= 85);
    assert.ok(['silver','gold','hall_of_fame'].includes(badgeTier(badge,result.final,body.height)));
    assert.ok(result.general <= 1 && result.specialized <= 2 && result.budgetState.fits);
    assert.ok(result.uses.filter(use => use.restricted).every(use => use.index >= 5 && use.index <= 7));
  }
});

test('checks several frames for guards, wings and centers', () => {
  for (const [position, height, weight, wingspan, index, minimum] of [
    ['PG',75,198,78,6,85], ['SF',80,220,83,12,85], ['C',84,245,89,16,90],
  ]) {
    const goals = empty();
    goals[index] = minimum;
    const { frames, results } = optimize({ body:{position,height,weight,wingspan}, searchFrames:true,
      goals, badgeGoals:[], budget:5, specialization:{category:'',count:0}, attributes });
    assert.ok(frames > 1);
    assert.ok(results.length);
    assert.ok(results.every(plan => plan.body.position === position && plan.final[index] >= minimum && plan.budgetState.fits));
  }
});


test('lowering a linked attribute reduces the ratings enforcing its minimum', () => {
  const base = empty();
  base[2] = 96;
  assert.equal(resolveLinks(base, 78)[1], 76);
  const lowered = lowerLinkedRatings(base, 78, 1, 70);
  const resolved = resolveLinks(lowered, 78);
  assert.equal(resolved[1], 70);
  assert.equal(resolved[2], 90);
});

test('the reported 6-foot-10 PF can finish at 81 Interior Defense', () => {
  const body = { height:82, weight:232, wingspan:83 };
  const ratings = [80,67,87,57,74,90,89,76,89,78,68,80,82,52,84,62,87,77,71,76,75];
  const caps = capsFor(body);
  assert.ok(assess(ratings, body.height, caps).fits);
  const interior = attributes.findIndex(item => item.name === 'interior_defense');
  ratings[interior]++;
  assert.deepEqual(resolveLinks(ratings, body.height), ratings);
  assert.ok(assess(ratings, body.height, caps).fits);
  for (let i = 0; i < ratings.length; i++) {
    const next = [...ratings];
    next[i]++;
    assert.equal(assess(resolveLinks(next, body.height), body.height, caps).fits, false, attributes[i].name);
  }
});

test('the OVR limit also accepts both published 6-foot-3 HQ boundary spreads', () => {
  const body = { height:75, weight:198, wingspan:78 };
  for (const row of data.official) assert.ok(assess(row.values, body.height, capsFor(body)).fits);
});

test('6-foot-9 Post Control uses the measured seven-point Close Shot gap', () => {
  const base = empty();
  for (let post = 80; post <= 90; post++) {
    base[4] = post;
    const ratings = resolveLinks(base, 81);
    assert.equal(ratings[0], post - 7);
    assert.equal(lowerLinkedRatings(ratings, 81, 0, post - 7)[4], post);
  }
});
