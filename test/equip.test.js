import assert from 'node:assert/strict';
import { test } from 'node:test';
import { metaSetup, shortfall } from '../src/equip.js';
import { goals } from '../src/breakpoints.js';

const g = n => goals.find(x => x.name === n);
const row = (key, discipline, maxTier) => ({ key, discipline, maxTier, goal: g(key), free: false });
const PRICE = { bronze: 3, silver: 2, gold: 1, hall_of_fame: 1 };

test('meta setup equips everything that fits and never goes over tokens + bonus', () => {
  const rows = [row('set_and_fire', 'shooting', 'gold'), row('deadeye', 'shooting', 'silver'), row('limitless_range', 'shooting', 'bronze')];
  const plan = metaSetup(rows, { shooting: 4 }, 0, (k, t) => PRICE[t], 'SF');
  const spent = rows.reduce((s, r) => s + (plan[r.key] === 'off' ? 0 : PRICE[plan[r.key]]), 0);
  assert.ok(spent <= 4, `spent ${spent}`);
  assert.ok(Object.values(plan).filter(t => t !== 'off').length >= 2);
});

test('the bonus pool covers whichever category is short', () => {
  const rows = [row('set_and_fire', 'shooting', 'bronze'), row('challenger', 'defense', 'bronze')];
  const none = metaSetup(rows, { shooting: 0, defense: 0 }, 0, () => 3, 'SF');
  assert.deepEqual(Object.values(none), ['off', 'off']);
  const some = metaSetup(rows, { shooting: 0, defense: 0 }, 3, () => 3, 'SF');
  assert.equal(Object.values(some).filter(t => t !== 'off').length, 1);
  assert.equal(shortfall({ shooting: 5, defense: 1 }, { shooting: 3, defense: 4 }), 2);
});
