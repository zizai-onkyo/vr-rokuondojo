// Record the award video without a visible browser: drives the game in headless Google Chrome over CDP (DevTools protocol).
// Needs the Vite dev server on 127.0.0.1:5173 (npm run dev). Headless Chrome renders with the real GPU (ANGLE/Metal) at 60 fps,
// Web Audio runs with a silent sink, and the recorder POSTs recordings/<name>.webm as usual. Use it when the in-app browser pane
// is hidden or the screen is locked (requestAnimationFrame then stalls and the recording freezes).
// Usage: node scripts/record_headless.mjs probe            # renderer / fps / audio check
//        node scripts/record_headless.mjs record award_take_v7   # → recordings/award_take_v7.webm (≈ 4.5 min)
//        node scripts/record_headless.mjs record award_take_v8 --split   # L = narration / R = gun mic (no ducking), + award_take_v8_stems.wav
//                                                                        # (48 kHz float, ch1 narration / ch2 mic / ch3 room) → scripts/make_split_video.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const mode = process.argv[2] || 'probe';           // probe | record
const name = process.argv[3] || 'award_take_v7';
const flags = process.argv.slice(4), split = flags.includes('--split');
const extra = flags.filter(f => f !== '--split' && f !== '--chromelog');   // the rest goes to Chrome
const PORT = 9333, SCRATCH = process.env.TMPDIR ? process.env.TMPDIR.replace(/\/$/, '') : '/tmp';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${SCRATCH}/chrome-profile`, '--window-size=1920,1080', '--force-device-scale-factor=1',
  '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', ...extra, 'about:blank'];
const chrome = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let chromeLog = ''; chrome.stderr.on('data', d => { chromeLog += d; }); chrome.stdout.on('data', d => { chromeLog += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targets() { for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); } } throw new Error('no devtools'); }
const list = await targets();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression, awaitPromise = true) => { const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }); if (r.result.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
for (let i = 0; i < 100; i++) { if (await evalJs(`typeof window.__game === 'object'`, false)) break; await sleep(200); }
await sleep(500);
const started = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('PCで体験')); if (!b) return 'no button'; b.click(); return 'clicked'; })()`, false);
await sleep(1500);
const info = await evalJs(`(async () => { const c = document.querySelector('canvas'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl')); const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info'); const ac = new AudioContext(); await ac.resume(); const st = __game.state(); return { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a', audio: ac.state, sampleRate: ac.sampleRate, mode: st.mode, phase: st.phase, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, vis: document.visibilityState }; })()`);
let fps = null;
if (mode === 'probe') { await sleep(3000); fps = await evalJs(`__game.state().fps`, false); const raf = await evalJs(`new Promise(r => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else r(n); }; requestAnimationFrame(tick); })`); console.log(JSON.stringify({ started, ...info, fps, rafPerSec: raf })); }
if (mode === 'record') {
  await evalJs(`__game.preloadAll()`);
  console.log(JSON.stringify({ started, ...info, at: new Date().toISOString() }));
  const t0 = Date.now();
  const res = await evalJs(`__game.runAward({ name: ${JSON.stringify(name)}, audio: ${JSON.stringify(split ? 'split' : 'mix')} }).then(r => JSON.stringify({ ok: true, r: r && r.rank ? { rank: r.rank, score: r.score, max: r.max } : null })).catch(e => JSON.stringify({ ok: false, err: String(e) }))`);
  let rec = null;      // wait for the recorder's POST (and, in split mode, the stems WAV)
  for (let i = 0; i < 240; i++) { const lr = await evalJs(`JSON.stringify(__game.lastRec())`, false); if (lr && lr !== 'null' && (!split || JSON.parse(lr).stems)) { rec = lr; break; } await sleep(500); }
  console.log(JSON.stringify({ rec }));
  const st = await evalJs(`JSON.stringify({ phase: __game.state().phase, fps: __game.state().fps })`, false);
  console.log(JSON.stringify({ result: res, state: st, seconds: Math.round((Date.now() - t0) / 1000) }));
}
ws.close(); chrome.kill('SIGTERM'); await sleep(500);
if (process.argv.includes('--chromelog')) console.log(chromeLog.slice(-1500));
process.exit(0);
