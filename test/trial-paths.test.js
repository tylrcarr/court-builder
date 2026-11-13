import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributes, capsFor, defaultBody, playerTypeCount, raiseResolved, raiseTrial, resolveLinks, resolveTrial, scoreAsOfSums,
  scoreOfSums, scoresAfter, sumsOf, sumsWith } from '../src/engine.js';

// The allocation-free trial helpers the solver's inner loops use must agree exactly with the plain versions.
let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const N = attributes.length, AT = new Int32Array(N), TO = new Int32Array(N), SC = { score: 0, playerType: 0, as: 0 };
const capAt = (r, caps) => r.map((v, k) => Math.min(v, caps[k]));
const applyDiff = (base, n) => { const out = base.slice(); for (let k = 0; k < n; k++) out[AT[k]] = TO[k]; return out; };

test('resolveTrial / raiseTrial / scoresAfter match full re-resolve and re-score', () => {
  let raised = 0;
  for (let n = 0; n < 500; n++) {
    const h = 69 + Math.floor(rnd() * 20), body = defaultBody(['PG', 'SG', 'SF', 'PF', 'C'][n % 5], h), caps = capsFor(body);
    const manual = caps.map(c => 25 + Math.floor(rnd() * (c - 24)));
    const U = resolveLinks(manual, h), base = capAt(U, caps), sums = sumsOf(base, h);
    const i = Math.floor(rnd() * N), value = Math.min(99, manual[i] + 1 + Math.floor(rnd() * 8));
    const type = Math.floor(rnd() * playerTypeCount(h));

    const want = capAt(resolveLinks(manual.map((v, k) => k === i ? value : v), h), caps);
    const c = resolveTrial(manual, i, value, h, base, caps, AT, TO);
    assert.deepEqual(applyDiff(base, c), want);
    const ref = sumsWith(sums, base, want, h), s = scoresAfter(sums, base, AT, TO, c, h, type, SC);
    assert.equal(s.score, scoreOfSums(ref, h).score);
    assert.equal(s.playerType, scoreOfSums(ref, h).playerType);
    assert.equal(s.as, scoreAsOfSums(ref, h, type));

    const v = Math.max(U[i], value), r = raiseResolved(U, h, i, v);
    const cr = raiseTrial(U, base, caps, h, i, v, AT, TO);
    assert.deepEqual(applyDiff(base, cr), capAt(r, caps));
    raised++;
  }
  assert.ok(raised > 400);
});
