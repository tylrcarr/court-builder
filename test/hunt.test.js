import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributes } from '../src/engine.js';
import { archetypeTable, huntBuild, huntScreen, pickCandidates } from '../src/hunt.js';

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
