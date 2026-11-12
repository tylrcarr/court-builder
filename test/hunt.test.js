import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributes } from '../src/engine.js';
import { archetypeTable, huntBuild, huntScreen, pickCandidates, positionsFor } from '../src/hunt.js';
import { metaGroup } from '../src/meta.js';

const ix = n => attributes.findIndex(a => a.name === n);
const picks = ['driving_dunk', 'vertical', 'steal'].map(ix);
const want = { [picks[0]]: 99, [picks[1]]: 90, [picks[2]]: 80 };
const breakers = { general: 15, future: 0, special: { category: 'shooting' } };

// The user's 17-breaker SG 6'6" (Driving Dunk 88→99, Vertical 77→90 through archetype 7): the hunt should find it.
test('archetype 7 carries Driving Dunk / Vertical / Steal furthest on a 6\'6" SG with a 7\'0" wingspan', () => {
  const [best] = archetypeTable(picks, { position: 'SG', height: 78, weight: 195, wingspan: 84 }, want);
  assert.equal(best.type, 7);
  assert.deepEqual(best.per.map(p => p.base), [88, 77, 48]);
});

test('hunt builds keep their Cap Breakers on the picked attributes and reach the targets', () => {
  const chosen = pickCandidates(huntScreen(['SG'], [78, 78], picks, want, breakers).found, { keep: 1 });
  assert.equal(chosen[0].type, 7);
  const r = huntBuild(chosen[0], { values: {}, breakers, mode: 'both', metaRate: 1 });
  assert.ok(!r.error, r.error);
  assert.equal(r.playerType, 7);
  for (const i of picks) {
    assert.equal(r.breakers[i], 5, attributes[i].name);
    assert.ok(r.final[i] >= want[i], `${attributes[i].name} ${r.final[i]}`);
  }
});

test('"Also require" minimums hold in every hunt build, and bodies that can\'t reach them are skipped', () => {
  const dr = ix('defensive_rebound'), need = { [dr]: 85 };
  const p = picks.slice(0, 2), w = { [p[1]]: 90 };
  const { found } = huntScreen(['SF'], [79, 79], p, w, breakers, { minStep: 2, need });
  assert.ok(found.length > 0);
  const r = huntBuild(pickCandidates(found, { keep: 1 })[0], { values: {}, breakers, mode: 'both', metaRate: 1 });
  assert.ok(!r.error, r.error);
  assert.ok(r.final[dr] >= 85, `defensive rebound ${r.final[dr]}`);
  assert.equal(huntScreen(['SF'], [79, 79], p, w, breakers, { need: { [dr]: 99 } }).found.length, 0);
});

test('the same build across positions and weights shows once (SF/PF/C share heights and frames)', () => {
  const p = picks.slice(0, 2), w = { [p[1]]: 90 };
  const found = [80, 81, 82].flatMap(h => huntScreen(['PG', 'SG', 'SF', 'PF', 'C'], [h, h], p, w, breakers, { minStep: 2 }).found);
  const chosen = pickCandidates(found);
  const keys = chosen.map(c => [c.when, c.body.height, c.body.wingspan, c.type].join());
  assert.equal(new Set(keys).size, keys.length, 'no repeated height/wingspan/archetype (a "needs more" version may sit next to its "fits now" one)');
  // Each family is tried as one frame per meta group it's legal in; positions in the same group share that frame.
  assert.ok(chosen.some(c => new Set(c.frames.map(f => metaGroup(f.body.position))).size > 1), 'tried across meta groups');
  for (const c of chosen) for (const f of c.frames)
    assert.deepEqual([f.body.position, ...f.alsoPositions].sort(), positionsFor(f.body).filter(q => metaGroup(q) === metaGroup(f.body.position)).sort());
});

test('"needs more" builds use the fewest extra breakers that hit every target, and only when yours fall short', () => {
  const few = { general: 8, future: 0, special: { category: 'shooting' } };
  // Targets 8 breakers can hit: no "needs more" at all.
  assert.ok(huntScreen(['SG'], [78, 78], picks, want, few, { minStep: 2 }).found.every(f => f.when === 'now'));
  const hard = { [picks[0]]: 99, [picks[1]]: 94, [picks[2]]: 95 };
  const found = huntScreen(['SG', 'SF'], [78, 78], picks, hard, few, { minStep: 2 }).found;
  const later = pickCandidates(found).filter(c => c.when === 'later');
  assert.ok(later.length > 0, 'some need more');
  for (const c of later) {
    assert.ok(c.uses > few.general && c.under === 0, `${c.uses} breakers, under ${c.under}`);
    const r = huntBuild(c, { values: {}, breakers: few, mode: 'both', metaRate: 1 });
    assert.ok(!r.error, r.error);
    for (const i of picks) assert.ok(r.final[i] >= c.goal[i], `${attributes[i].name} ${r.final[i]} < ${c.goal[i]}`);
    assert.equal(r.future, c.uses - few.general, 'only the extra it needs');
  }
});

test('every position a body is legal at is listed, even ones the search never tried', () => {
  assert.deepEqual(positionsFor({ position: 'SF', height: 82, weight: 250, wingspan: 88 }), ['SF', 'PF', 'C']);
  const [c] = pickCandidates(huntScreen(['SF'], [82, 82], picks.slice(0, 2), { [picks[1]]: 90 }, breakers, { minStep: 0 }).found, { keep: 1 });
  for (const f of c.frames) {
    const covered = c.frames.filter(g => g.body.weight === f.body.weight).flatMap(g => [g.body.position, ...g.alsoPositions]);
    assert.deepEqual(covered.sort(), positionsFor(f.body).sort(), 'every legal position is covered by some frame');
  }
});
