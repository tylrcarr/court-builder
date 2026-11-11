// Drives the NBA 2K HQ MyPLAYER builder on the rooted Android emulator via adb,
// reading the screen with Windows OCR. Coordinates are for a 1080x2400 Pixel 7 AVD.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ADB = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const DEVICE = process.env.HQ_DEVICE ?? 'emulator-5556';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-'));
let shotCount = 0;

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = (...args) => execFileSync(ADB, ['-s', DEVICE, ...args], { maxBuffer: 64 << 20 });
export const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
export const swipe = (x1, y1, x2, y2, ms = 300) =>
  adb('shell', 'input', 'swipe', ...[x1, y1, x2, y2, ms].map(v => String(Math.round(v))));

export function screenshot() {
  const file = path.join(TMP, `s${shotCount++ % 4}.png`);
  fs.writeFileSync(file, adb('exec-out', 'screencap', '-p'));
  return file;
}

export function ocr(file) {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(here, 'ocr.ps1'), file], { encoding: 'utf8' }).trim();
  if (!out) return [];
  const lines = JSON.parse(out);
  return (Array.isArray(lines) ? lines : [lines]).sort((a, b) => a.y - b.y || a.x - b.x);
}

export function ocrRegion(file, x, y, w, h, scale = 2, invert = false) {
  const out = path.join(TMP, `crop${shotCount}-${x}.png`);
  execFileSync('python', ['-I', path.join(here, 'crop.py'), file, out, x, y, w, h, scale, invert ? 1 : 0].map(String));
  return ocr(out).map(line => ({ ...line, x: x + line.x / scale, y: y + line.y / scale, x2: x + line.x2 / scale }));
}

const norm = text => text.toUpperCase().replace(/[^A-Z]/g, '');
const KEYS = {
  CLOSESHOT: 'close_shot', DRIVINGLAYUP: 'driving_layup', DRIVINGDUNK: 'driving_dunk', STANDINGDUNK: 'standing_dunk',
  POSTCONTROL: 'post_control', MIDRANGESHOT: 'mid_range', THREEPOINTSHOT: 'three_point', FREETHROW: 'free_throw',
  PASSACCURACY: 'pass_accuracy', BALLHANDLE: 'ball_handle', SPEEDWITHBALL: 'speed_with_ball',
  INTERIORDEFENSE: 'interior_defense', PERIMETERDEFENSE: 'perimeter_defense', STEAL: 'steal', BLOCK: 'block',
  OFFENSIVEREBOUND: 'offensive_rebound', DEFENSIVEREBOUND: 'defensive_rebound',
  SPEED: 'speed', AGILITY: 'agility', STRENGTH: 'strength', VERTICAL: 'vertical',
};
export const keyFor = text => KEYS[norm(text.replace(/^\s*[O0@Q]\s+/, ''))] ?? null;

// ---------- Body screen ----------
const PICKER = { position: 145, height: 408, weight: 671, wingspan: 935 };
const PICKER_Y = 1958, PICKER_STEP = 50;

export function readBodyScreen(file = screenshot()) {
  const lines = ocr(file);
  const caps = {};
  // Two columns: names at x<560 / x>=560, values right-aligned near x=470 / x=995.
  for (const side of [[0, 560, 440, 560], [560, 1080, 960, 1080]]) {
    const [nx1, nx2, vx1, vx2] = side;
    const names = lines.filter(l => l.x >= nx1 && l.x < nx2 - 120 && keyFor(l.t));
    const values = lines.filter(l => l.x >= vx1 && l.x < vx2 && /^\d{2}$/.test(l.t.trim()));
    for (const n of names) {
      const v = values.find(v => Math.abs(v.y - n.y) <= 12);
      if (v) caps[keyFor(n.t)] = Number(v.t);
    }
  }
  const [height, wingspan] = glyphRead(file, PICKER.height, PICKER.wingspan);
  const weight = ocrRegion(file, PICKER.weight - 92, PICKER_Y - 34, 184, 68, 3, true).map(l => l.t).join(' ').trim();
  return { caps, body: { height, weight, wingspan }, file };
}

// Feet/inch wheels are read by template matching (Windows OCR is unreliable on them).
export const glyphRead = (file, ...xs) =>
  execFileSync('python', ['-I', path.join(here, 'glyphs.py'), 'read', file, ...xs.map(String)], { encoding: 'utf8' }).trim().split(' ');
export const glyphLearn = (file, x, label) =>
  execFileSync('python', ['-I', path.join(here, 'glyphs.py'), 'learn', file, String(x), label], { encoding: 'utf8' }).trim();
export const feetLabel = inches => `${Math.floor(inches / 12)}'${inches % 12}`;

export const parseFeet = text => {
  const m = String(text).match(/^([5-7])'(1[01]|\d)"$/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
};
export const parseLbs = text => Number(text.match(/(\d{3})/)?.[1] ?? NaN);

export async function stepPicker(field, steps) {
  const x = PICKER[field];
  for (let i = 0; i < Math.abs(steps); i++) {
    // A slow ~65px drag moves the wheel exactly one row; upward = next value.
    if (steps > 0) swipe(x, PICKER_Y + 22, x, PICKER_Y - 43, 600);
    else swipe(x, PICKER_Y - 22, x, PICKER_Y + 43, 600);
    await sleep(900);
  }
}

export async function positionToTop() {
  for (let i = 0; i < 3; i++) { swipe(PICKER.position, 1900, PICKER.position, 2350, 400); await sleep(800); }
}

// Steps one row at a time from a known reading, so an unknown digit (e.g. the first 8)
// can be learned from the value implied by counting. The wheel does not wrap.
export async function setHeight(target, log = () => {}) {
  let known = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const screen = readBodyScreen();
    let now = parseFeet(screen.body.height);
    // Only the digit 8 is unlearned, so an unreadable value may be learned only when its label has an 8
    // in exactly the unreadable positions. Anything else is a read error, never a new template.
    if (now == null && known != null) {
      const label = feetLabel(known), seen = String(screen.body.height).replace(/"$/, '');
      const fits = seen.length === label.length && [...seen].every((c, k) => c === label[k] || (c === '?' && label[k] === '8'));
      if (fits && seen.includes('?')) { log(`learning 8 from ${label}: ${glyphLearn(screen.file, PICKER.height, label)}`); now = known; }
    }
    if (now == null) {
      if (known == null && attempt < 4) { log(`height unreadable (${screen.body.height}); stepping to a readable neighbour`); await stepPicker('height', attempt % 2 ? 1 : -1); continue; }
      log(`height unreadable (${screen.body.height})`); return false;
    }
    if (now === target) return true;
    const dir = Math.sign(target - now);
    await stepPicker('height', dir);
    known = now + dir;
  }
  return false;
}

// ---------- Attribute screen ----------
// Slider geometry measured at 1080px width: thumb x for value v on a row whose cap is c.
const TRACK_X0 = 110, PX_PER_POINT = 10.3;
export const thumbX = v => TRACK_X0 + (v - 25) * PX_PER_POINT;
export const plusX = cap => PX_PER_POINT * cap - 120;
export const MINUS_X = 65;

export function readAttributeScreen(file = screenshot()) {
  const lines = ocr(file);
  const rows = [];
  for (const n of lines.filter(l => l.x < 600 && keyFor(l.t))) {
    const v = lines.find(l => l.x > 850 && Math.abs(l.y - n.y) <= 14 && /^\d{2}\s*\/\s*\d{2}$/.test(l.t.replace(/\s/g, '')));
    if (!v) continue;
    const [value, cap] = v.t.replace(/\s/g, '').split('/').map(Number);
    rows.push({ key: keyFor(n.t), y: n.y, value, cap, controlY: n.y + 100 });
  }
  const ovr = lines.find(l => l.y > 290 && l.y < 370 && l.x > 900 && /^\d{2}$/.test(l.t.trim()));
  return { rows, overall: ovr ? Number(ovr.t) : null, lines };
}
