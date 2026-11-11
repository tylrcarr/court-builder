// Derives linked-attribute corrections from HQ builder observations.
// A disputed link entry (HQ tuning value vs. an alternative candidate) is confirmed when a clean probe's full
// 21-value outcome matches only with the candidate value, i.e. the entry is decisive for that probe.
// usage: node tools/hq/derive-corrections.mjs <candidates.json> <observations.jsonl...>
//   candidates.json: [{ h, src, tgt, hq, alt }] using attribute names.
import fs from 'node:fs';
import { attributes, empty } from '../../src/engine.js';
import data from '../../src/rules.json' with { type: 'json' };

const [candidateFile, ...obsFiles] = process.argv.slice(2);
const idx = Object.fromEntries(attributes.map(a => [a.name, a.index]));
const candidates = JSON.parse(fs.readFileSync(candidateFile, 'utf8'));
const probes = obsFiles.flatMap(f => fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l)))
  .filter(r => r.kind === 'link' && Object.keys(r.values).length === 21 && r.values[r.src] >= r.caps[r.src]);

function resolve(manual, links, caps) {
  const r = [...manual]; let changed;
  do { changed = false; for (const [s, t, d] of links) { const m = Math.min(caps[t], r[s] - d); if (r[t] < m) { r[t] = m; changed = true; } } } while (changed);
  return r;
}
const tableWith = (h, overrides) => (data.links[h] ?? []).map(([s, t, d]) => {
  const o = overrides.find(c => idx[c.src] === s && idx[c.tgt] === t); return [s, t, o ? o.value : d];
});
const matches = (probe, table) => {
  const caps = attributes.map(a => probe.caps[a.name]);
  const manual = empty(); manual[idx[probe.src]] = probe.values[probe.src];
  const pred = resolve(manual, table, caps);
  return attributes.every(a => pred[a.index] === probe.values[a.name]);
};

const results = [];
for (const c of candidates) {
  const atH = probes.filter(p => p.body.height === c.h);
  const others = candidates.filter(x => x.h === c.h && x !== c);
  let verdict = 'untested', evidence = null;
  for (const p of atH) {
    // Hold the other disputed entries at whichever values make this probe match best (alt first).
    const base = others.map(o => ({ ...o, value: o.alt }));
    const withAlt = matches(p, tableWith(c.h, [...base, { ...c, value: c.alt }]));
    const withHq = matches(p, tableWith(c.h, [...base, { ...c, value: c.hq }]));
    if (withAlt && !withHq) { verdict = 'confirmed-alt'; evidence = `${p.src}=${p.values[p.src]} @ ${p.at}`; break; }
    if (withHq && !withAlt) { verdict = 'confirmed-hq'; evidence = `${p.src}=${p.values[p.src]} @ ${p.at}`; break; }
    if (withHq && withAlt && verdict === 'untested') verdict = 'not-decisive';
  }
  results.push({ ...c, verdict, evidence });
}
const counts = results.reduce((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {});
console.log(JSON.stringify(counts));
for (const r of results.filter(r => r.verdict !== 'confirmed-alt'))
  console.log(`  ${r.h} ${r.src}->${r.tgt} hq ${r.hq} alt ${r.alt}: ${r.verdict}`);
fs.writeFileSync('research/hq-observations/link-verdicts.json', JSON.stringify(results, null, 1));
