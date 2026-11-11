import { tap, swipe, sleep, screenshot, readAttributeScreen, thumbX } from './hq.mjs';
const step = process.argv[2];
if (step === 'continue') { tap(540, 2215); await sleep(3000); }
if (step === 'reset') { tap(308, 530); await sleep(2000); }
if (step === 'drag') { const [key] = process.argv.slice(3); const s = readAttributeScreen(); const r = s.rows.find(r => r.key === key); swipe(thumbX(r.value), r.controlY, 1000, r.controlY, 600); await sleep(1500); }
const s = readAttributeScreen();
console.log('OVR', s.overall, '|', s.rows.map(r => `${r.key}=${r.value}/${r.cap}@${r.y}`).join(' '));
if (process.argv.includes('--lines')) console.log(s.lines.map(l => `${l.y} ${l.x} ${l.t}`).join('\n'));
