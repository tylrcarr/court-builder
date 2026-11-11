// Decodes the linked-attribute table straight from the tuning blob shipped inside the NBA 2K HQ app.
//
// Layout (reverse-engineered, NBA 2K HQ 1.1.45): one block per source attribute, separated by padding.
// Heights: block row k = 63 + k inches, so 69..88 in = rows 6..25.
// Each block holds 29 height buckets of 6 slots, and each
// slot is (int32 target attribute, int32 MaxDelta). Target code 21 marks an empty slot. Target codes equal
// this app's attribute indices. Block alignment varies, so each block is aligned (and assigned to its source
// attribute) by best agreement with the named tuning export, whose values are mostly right but whose
// labels contain errors — the decoded bytes, not the export, are the result.
//
// usage: node tools/decode-links.mjs <tuning.zlib.asset> [out.json]
import fs from 'node:fs';
import zlib from 'node:zlib';
import data from '../src/rules.json' with { type: 'json' };

const [file, out] = process.argv.slice(2);
const raw = fs.readFileSync(file);
const blob = zlib.inflateSync(raw.subarray(raw.indexOf(Buffer.from('ZLIB')) + 16));
const ANCHOR = 61884; // a Ball Handle row, located by its known MaxDelta sequence
const EMPTY = 21, HEIGHTS = 29, SLOTS = 6, FIRST = 5, LAST = 24;
// Row k of a block holds height 63 + k inches (verified against the HQ builder). The named export labels
// row k as HEIGHT_k and maps it to 64 + k, which puts every link one inch too tall.
const ROW_HEIGHT = k => 63 + k;

const valid = o => { const a = blob.readInt32LE(o), d = blob.readInt32LE(o + 4); return a >= 0 && a <= 21 && d >= 0 && d <= 99; };
let start = ANCHOR; while (start >= 8 && valid(start - 8)) start -= 8;
let end = ANCHOR; while (valid(end)) end += 8;
const pairs = [];
for (let o = start; o < end; o += 8) pairs.push([blob.readInt32LE(o), blob.readInt32LE(o + 4)]);

// Split into blocks at long runs of empty slots.
const blocks = [];
let i = 0;
while (i < pairs.length) {
  while (i < pairs.length && pairs[i][0] === EMPTY) i++;
  if (i >= pairs.length) break;
  const first = i; let last = i, gap = 0;
  for (; i < pairs.length; i++) {
    if (pairs[i][0] === EMPTY) { if (++gap >= 10) break; } else { gap = 0; last = i; }
  }
  blocks.push({ first, last });
}

const exportRows = (src, h) => new Map((data.links[h] ?? []).filter(([s]) => s === src).map(([, t, d]) => [t, d]));
const rowAt = (s, k) => pairs.slice(s + k * SLOTS, s + (k + 1) * SLOTS).filter(([t]) => t !== EMPTY);

const links = {}, report = [];
const taken = new Set();
for (const b of blocks) {
  let best = null;
  for (let s = b.first - SLOTS + 1; s <= b.first; s++) {
    if (s < 0 || s + HEIGHTS * SLOTS <= b.last) continue;
    for (let src = 0; src < 21; src++) {
      let score = 0;
      for (let k = FIRST; k <= LAST; k++) {
        const want = exportRows(src, 64 + k);
        for (const [t, d] of rowAt(s, k)) score += want.get(t) === d ? 2 : want.has(t) ? 1 : 0;
      }
      if (!best || score > best.score) best = { s, src, score };
    }
  }
  if (taken.has(best.src)) throw new Error(`two blocks matched source ${best.src}`);
  taken.add(best.src);
  for (let k = FIRST + 1; k <= LAST + 1; k++)
    for (const [t, d] of rowAt(best.s, k)) {
      if (t === best.src) throw new Error(`self link in block for source ${best.src}`);
      (links[ROW_HEIGHT(k)] ??= []).push([best.src, t, d]);
    }
  report.push(`${data.attributes[best.src].name} score ${best.score}`);
}
if (blocks.length !== 21) throw new Error(`expected 21 source blocks, found ${blocks.length}`);
for (const h of Object.keys(links)) links[h].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
if (out) fs.writeFileSync(out, JSON.stringify({ source: file, region: [start, end], links }));
console.log('blocks', blocks.length, '| entries', Object.values(links).reduce((s, l) => s + l.length, 0));
console.log(report.join('; '));
