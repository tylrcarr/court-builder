import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildName } from '../src/build-name.js';
import publishedBuilds from './published-build-names.json' with { type: 'json' };
import { assess, capsFor, ladder } from '../src/engine.js';

const pf = [80,67,87,57,74,90,89,76,89,78,68,80,82,52,84,62,87,77,71,76,75];
test('predicts the CVPalace name at 80 and 81 Interior Defense', () => {
  assert.equal(buildName('PF', pf), 'Rim-Reaping 3-Level Pilot');
  const upgraded = pf.with(11, 81);
  assert.equal(buildName('PF', upgraded), 'Rim-Reaping 3-Level Pilot');
  assert.equal(buildName('PF', upgraded.with(7, 25)), 'Rim-Reaping 3-Level Pilot');
  assert.equal(buildName('PF', upgraded.with(7, 99)), 'Rim-Reaping 3-Level Pilot');
});

test('matches the CVPalace breaker preview for the completed PF', () => {
  const height = 82;
  const caps = capsFor({ height, weight:232, wingspan:83 });
  const ratings = pf.with(11, 81);
  const { playerType } = assess(ratings, height, caps);
  const expected = [
    [2,2,1,1,1],[3,3,2,2,2],[],[3,3,3,3,3],[3,3,2,2,2],[1,1],[],[5,4,4,3,2],
    [1,1,1,1,1],[],[],[2,2,1,1,1],[],[4,4,3,3,3],[1,1,1,1,1],[5,5,4,3,3],
    [],[],[],[1,1,1,1,1],[2,2,2,2,2],
  ];
  assert.deepEqual(ratings.map((rating, i) => ladder(i, rating, caps[i], height, playerType).filter(Boolean)), expected);
});

test('matches all CVPalace body caps on the sampled PG and PF frames', () => {
  assert.deepEqual(capsFor({height:74,weight:183,wingspan:77}),
    [99,99,92,47,74,96,95,99,99,98,94,68,94,99,62,59,62,98,98,63,99]);
  assert.deepEqual(capsFor({height:82,weight:232,wingspan:83}),
    [94,91,87,96,99,92,89,94,99,78,68,96,82,75,90,86,87,77,71,96,90]);
});

test('the PF changes names with two Interior Defense breakers', () => {
  const ratings = pf.with(11, 81);
  const caps = capsFor({ height:82, weight:232, wingspan:83 });
  const { playerType } = assess(ratings, 82, caps);
  const gains = ladder(11, ratings[11], caps[11], 82, playerType);
  const afterTwo = ratings.with(11, ratings[11] + gains[0] + gains[1]);
  assert.equal(afterTwo[11], 85);
  assert.equal(buildName('PF', afterTwo), '2-Way 3-Level Playmaker');
  assert.equal(buildName('PF', ratings), 'Rim-Reaping 3-Level Pilot');
});


test('matches published names across all five positions, ignoring capitalization', () => {
  for (const [position, publishedName, ratings] of publishedBuilds) {
    assert.equal(buildName(position, ratings)?.toLowerCase(), publishedName.toLowerCase(), publishedName);
  }
});

test('reruns threshold adjustment when the first pass only finds two qualifying ratings', () => {
  const ratings = [87,58,68,60,63,65,80,61,35,56,56,35,62,48,79,32,70,59,83,59,80];
  assert.equal(buildName('PG', ratings), 'Shot-Erasing Sniper');
});

test('position changes the reported 6-foot-11 build from Glass Guardian to Edge Enforcer', () => {
  const base = [74,71,89,70,55,68,78,83,89,70,64,80,72,42,84,89,94,75,66,84,80];
  const final = base.with(2, 93).with(6, 80).with(13, 63).with(15, 90).with(16, 95);
  for (const ratings of [base, final]) {
    assert.equal(buildName('PF', ratings), 'Showtime Glass Guardian');
    assert.equal(buildName('C', ratings), 'Showtime Edge Enforcer');
  }
});

test('uses the reported in-game name for the confirmed Center final spread', () => {
  const final = [74,71,93,70,55,68,78,83,89,70,64,80,72,63,84,90,95,75,66,84,80];
  assert.equal(buildName('C', final), '2-Way Rim-Rocking Dimer');
  assert.equal(buildName('PF', final), 'Showtime Glass Guardian');
  assert.equal(buildName('C', final.with(13, 42)), 'Showtime Edge Enforcer');
});
