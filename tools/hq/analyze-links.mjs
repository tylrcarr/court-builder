// Compares HQ observations against engine predictions.
// usage: node tools/hq/analyze-links.mjs <observations.jsonl> [...]
import fs from 'node:fs';
import { attributes, capsFor, empty } from '../../src/engine.js';
import data from '../../src/rules.json' with { type: 'json' };

const idx = Object.fromEntries(attributes.map(a => [a.name, a.index]));
const mpFile = 'research/third-party/2kmyplayer-links.json';
const mp = fs.existsSync(mpFile) ? JSON.parse(fs.readFileSync(mpFile, 'utf8')) : null;
const OVERRIDES = [[idx.post_control, idx.close_shot, 7], [idx.speed_with_ball, idx.speed, 4]];
const withOverrides = h => (data.links[h] ?? []).map(([s, t, d]) => {
  const o = OVERRIDES.find(([a, b]) => a === s && b === t); return [s, t, o ? o[2] : d];
});
const tables = {
  current: h => data.links[h] ?? [],
  overrides: withOverrides,
  ...(mp ? { '2kmyplayer': h => mp[h] ?? [] } : {}),
};
function resolve(manual, links, caps) {
  const r = [...manual]; let changed;
  do { changed = false; for (const [s, t, d] of links) { const m = Math.min(caps[t], r[s] - d); if (r[t] < m) { r[t] = m; changed = true; } } } while (changed);
  return r;
}

const rows = process.argv.slice(2).flatMap(f => fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l)));
let capBodies = 0, capMiss = 0, skipped = 0; const capNotes = [];
const score = Object.fromEntries(Object.keys(tables).map(k => [k, { probes: 0, exact: 0, wrongValues: 0 }]));
const notes = [];
for (const r of rows) {
  if (r.kind === 'caps') {
    capBodies++; const pred = capsFor(r.body);
    const bad = attributes.filter(a => r.caps[a.name] !== pred[a.index]).map(a => `${a.name} HQ ${r.caps[a.name]} eng ${pred[a.index]}`);
    if (bad.length) { capMiss++; capNotes.push(`${r.body.position} ${r.body.height}/${r.body.weight}/${r.body.wingspan}: ${bad.join(', ')}`); }
  }
  if (r.kind !== 'link') continue;
  if (Object.keys(r.values).length < 21 || r.values[r.src] < r.caps[r.src]) { skipped++; continue; }
  const caps = attributes.map(a => r.caps[a.name]);
  const manual = empty(); manual[idx[r.src]] = r.values[r.src];
  for (const [name, table] of Object.entries(tables)) {
    const pred = resolve(manual, table(r.body.height), caps);
    const wrong = attributes.filter(a => r.values[a.name] !== pred[a.index]);
    score[name].probes++; if (!wrong.length) score[name].exact++; score[name].wrongValues += wrong.length;
    if (name === 'overrides' && wrong.length) notes.push(`${r.body.height} ${r.src}=${r.values[r.src]}: ` + wrong.map(a => `${a.name} HQ ${r.values[a.name]} pred ${pred[a.index]}`).join(', '));
  }
}
console.log(`caps: ${capBodies - capMiss}/${capBodies} bodies match engine exactly`); capNotes.forEach(n => console.log('  ' + n));
console.log(`skipped ${skipped} incomplete probes`);
console.log('links (probe exact = all 21 values match):'); for (const [k, v] of Object.entries(score)) console.log(`  ${k.padEnd(11)} ${v.exact}/${v.probes} exact, ${v.wrongValues} wrong values`);
if (notes.length) { console.log('mismatches vs current+overrides:'); notes.forEach(n => console.log('  ' + n)); }
