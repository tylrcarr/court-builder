import assert from 'node:assert/strict';
import { test } from 'node:test';
import probes from './hq-link-probes.json' with { type: 'json' };
import { attributes, empty, resolveLinks } from '../src/engine.js';

// Each probe: in the NBA 2K HQ builder, reset to 25s, raise one attribute to its cap, read all 21 ratings.
test('linked minimums reproduce every HQ builder probe exactly', () => {
  for (const p of probes) {
    const manual = empty();
    manual[attributes.find(a => a.name === p.src).index] = p.values[p.src];
    const got = resolveLinks(manual, p.body.height).map((v, i) => Math.min(v, p.caps[attributes[i].name]));
    const expected = attributes.map(a => p.values[a.name]);
    assert.deepEqual(got, expected, `${p.body.position} ${p.body.height} in, ${p.src}=${p.values[p.src]}`);
  }
});

test('6-foot-9 Post Control 84 gives Close Shot 77 (in-game report)', () => {
  const manual = empty();
  manual[attributes.find(a => a.name === 'post_control').index] = 84;
  assert.equal(resolveLinks(manual, 81)[attributes.find(a => a.name === 'close_shot').index], 77);
});
