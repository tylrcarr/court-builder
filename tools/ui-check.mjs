// Drives headless Chrome over the DevTools protocol to exercise the UI and save screenshots.
// usage: node tools/ui-check.mjs <baseUrl> <outDir> <script.json>
// script: [{ go: "#/lab" } | { click: "button text" } | { type: ["selector", "text"] } | { wait: ms } | { shot: "name", height?: px } | { eval: "js" }]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [base, outDir, scriptFile] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const port = 9333;
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu',
  `--remote-debugging-port=${port}`, '--window-size=1440,1000', `--user-data-dir=${path.join(outDir, '.profile')}`, 'about:blank'],
  { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

for (const step of steps) {
  if (step.go) { await send('Page.navigate', { url: base + step.go }); await sleep(1500); }
  if (step.click) {
    const ok = await evaluate(`(() => { const want = ${JSON.stringify(step.click)}; const els = [...document.querySelectorAll('button, label.button, summary')];
      const el = els.find(e => e.textContent.trim() === want) ?? els.find(e => e.textContent.trim().startsWith(want));
      if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`);
    if (!ok) errors.push('click target not found: ' + step.click);
    await sleep(step.after ?? 400);
  }
  if (step.type) {
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(step.type[0])}); if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set; setter.call(el, ${JSON.stringify(step.type[1])});
      el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(300);
  }
  if (step.eval) console.log('eval:', JSON.stringify(await evaluate(step.eval)));
  if (step.wait) await sleep(step.wait);
  if (step.waitFor) {
    for (let i = 0; i < 100; i++) { if (await evaluate(step.waitFor)) break; await sleep(200); }
  }
  if (step.shot) {
    const height = step.height ?? await evaluate('document.documentElement.scrollHeight');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: Math.min(height, 6000), deviceScaleFactor: 1, mobile: false });
    await evaluate('window.scrollTo(0,0)'); await sleep(300);
    const { result } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, step.shot + '.png'), Buffer.from(result.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    console.log('shot', step.shot, height);
  }
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
ws.close(); chrome.kill();
