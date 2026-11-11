// Verifies linked-attribute behaviour in NBA 2K HQ.
// usage: node tools/hq/run-links.mjs <tests.json> [out.jsonl]
// tests.json: [{ h, srcName, ... }]  — one probe per (height, source attribute).
import fs from 'node:fs';
import { tap, swipe, sleep, screenshot, readBodyScreen, readAttributeScreen, positionToTop, stepPicker,
  setHeight, parseFeet, parseLbs, thumbX } from './hq.mjs';
import data from '../../src/rules.json' with { type: 'json' };

const [testsFile, outFile = `research/hq-observations/links-${new Date().toISOString().slice(0, 10)}.jsonl`] = process.argv.slice(2);
const tests = JSON.parse(fs.readFileSync(testsFile, 'utf8'));
fs.mkdirSync('research/hq-observations', { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

async function readStable(read, tries = 4) {
  let prev = JSON.stringify(read());
  for (let i = 0; i < tries; i++) {
    await sleep(700);
    const next = JSON.stringify(read());
    if (next === prev) return JSON.parse(next);
    prev = next;
  }
  throw new Error('screen never stabilised');
}

async function scrollToTop() {
  for (let i = 0; i < 6; i++) {
    if (readAttributeScreen().rows.some(r => r.key === 'close_shot')) return;
    swipe(540, 700, 540, 1900, 300); await sleep(900);
  }
  throw new Error('could not scroll to top');
}

async function readAll() {
  for (let attempt = 0; attempt < 2; attempt++) {
    await scrollToTop();
    const values = {}, caps = {};
    let repeats = 0, last = '';
    for (let i = 0; i < 12; i++) {
      const s = await readStable(() => readAttributeScreen().rows.map(({ key, value, cap }) => ({ key, value, cap })));
      for (const r of s) { values[r.key] = r.value; caps[r.key] = r.cap; }
      if (Object.keys(values).length === 21) return { values, caps };
      const sig = JSON.stringify(s);
      repeats = sig === last ? repeats + 1 : 0; last = sig;
      if (repeats >= 2 && 'vertical' in values) break;
      swipe(540, 1650, 540, 850, 900); await sleep(1100);
    }
    if (attempt === 1) return { values, caps };
  }
}

// Drags a slider to its cap and verifies; retries from wherever the thumb ended up.
async function maxOut(key) {
  for (let tries = 0; tries < 4; tries++) {
    const row = await findRow(key);
    if (row.value >= row.cap) return row;
    swipe(thumbX(row.value), row.controlY, 1055, row.controlY, 800); await sleep(1500);
  }
  return findRow(key);
}

async function resetAttributes() {
  await scrollToTop();
  tap(308, 530); await sleep(1500);
  const confirm = readAttributeScreen().lines.find(l => /^yes$/i.test(l.t.trim()));
  if (!confirm) throw new Error('reset confirmation not found');
  tap(540, confirm.y + 15); await sleep(1800);
}

async function findRow(key) {
  await scrollToTop();
  for (let i = 0; i < 8; i++) {
    const row = readAttributeScreen().rows.find(r => r.key === key);
    if (row && row.controlY < 2150) return row;
    swipe(540, 1700, 540, 900, 900); await sleep(1100);
  }
  throw new Error('row not found: ' + key);
}

async function goToBody() {
  if (Object.keys(readBodyScreen().caps).length >= 15) return;
  tap(48, 258); await sleep(2500);
}

const byHeight = new Map();
for (const t of tests) (byHeight.get(t.h) ?? byHeight.set(t.h, new Set()).get(t.h)).add(t.srcName);

for (const [h, sources] of byHeight) {
  const position = ORDER.find(p => data.positions[p].some(r => r.height === h));
  log(`height ${h} (${position}) sources: ${[...sources].join(', ')}`);
  await goToBody();
  await positionToTop();
  await stepPicker('position', ORDER.indexOf(position));
  await sleep(800);
  if (!await setHeight(h, log)) { log('could not set height', h); continue; }
  const bodyScreen = readBodyScreen();
  const body = { position, height: h, weight: parseLbs(bodyScreen.body.weight), wingspan: parseFeet(bodyScreen.body.wingspan) };
  fs.appendFileSync(outFile, JSON.stringify({ kind: 'caps', body, caps: bodyScreen.caps, rawBody: bodyScreen.body, at: new Date().toISOString() }) + '\n');
  tap(540, 2215); await sleep(3000);
  for (const src of sources) {
    try {
      await resetAttributes();
      const row = await maxOut(src);
      if (row.value < row.cap) log(`  ${src} only reached ${row.value}/${row.cap} (Overall limit or drag miss)`);
      const state = await readAll();
      fs.appendFileSync(outFile, JSON.stringify({ kind: 'link', body, src, ...state, at: new Date().toISOString() }) + '\n');
      log(`  ${src}=${state.values[src]}/${state.caps[src]} read ${Object.keys(state.values).length}/21`);
    } catch (error) {
      log(`  ${src} FAILED: ${error.message}`);
      fs.appendFileSync(outFile, JSON.stringify({ kind: 'error', body, src, error: error.message }) + '\n');
    }
  }
  tap(48, 258); await sleep(2500);
}
log('done');
