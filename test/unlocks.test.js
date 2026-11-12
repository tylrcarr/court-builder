import assert from 'node:assert/strict';
import { test } from 'node:test';
import { animations } from '../src/animations.js';
import { animationGap, animationTabs, sizeFamily, takeovers } from '../src/unlocks.js';

const SIZE_RANGE = { A: [69, 88], S: [69, 76], B: [82, 88] };

test('Lab contact dunk goals match the HQ animation glossary', () => {
  const contact = animationTabs.find(t => t.name === 'Dunks').groups.filter(g => g.name.includes('Contact')).flatMap(g => g.anims);
  assert.equal(contact.length, animations.length);
  for (const goal of animations) {
    const reqs = goal.tiers[0].requirements.map(r => [r.attribute, r.minimum]).sort((a, b) => a[0] - b[0]);
    const hq = contact.find(a => JSON.stringify([...a.reqs].sort((x, y) => x[0] - y[0])) === JSON.stringify(reqs));
    assert.ok(hq, `${goal.name} has an HQ row with the same requirements`);
    assert.deepEqual(goal.height_inches, SIZE_RANGE[hq.sizes], `${goal.name} height range`);
  }
});

test('size families and OR/AND gaps', () => {
  assert.deepEqual([69, 76, 77, 81, 82, 88].map(sizeFamily), ['S', 'S', 'W', 'W', 'B', 'B']);
  const final = Array(21).fill(60); final[5] = 80; final[6] = 70;
  assert.equal(animationGap({ or: true, reqs: [[5, 81], [6, 81]] }, final), 1);
  assert.equal(animationGap({ or: false, reqs: [[5, 81], [6, 81]] }, final), 12);
  assert.equal(animationGap({ or: true, reqs: [[5, 81]] }, final, Array(21).fill(80)), Infinity);
});

test('18 attribute-gated takeovers across five slots', () => {
  assert.equal(takeovers.length, 18);
  assert.ok(takeovers.every(t => t.reqs.every(([i, v]) => Number.isInteger(i) && v >= 75 && v <= 91)));
});
