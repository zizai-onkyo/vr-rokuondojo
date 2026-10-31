import * as THREE from 'three';
import { buildSet, LAYER_DEBUG, LAYER_CAMPROP, LAYER_STUDIO, OPERATOR_POS } from './set.js';
import { actorFromScript } from './actors.js';
import { buildCrew } from './crew.js';
import { Boom, samplePointsFor } from './boom.js';
import { Judge } from './judge.js';
import { Dialogue } from './dialogue.js';
import { Score } from './score.js';
import { Hud, MonitorOverlay } from './ui.js';
import { DesktopInput } from './input_desktop.js';
import { XRInput } from './input_xr.js';
import { Recorder } from './recorder.js';
import { AutoOperator } from './demo.js';
import { awardSequence } from './sequences.js';
import { STAGES, DIRECTOR_URL, PRESENTER_URL } from './stages.js';
import { buildPresenter } from './presenter.js';
import { standbyPlan, verdictId, DIALOGUE_LEAD } from './flow.js';

// ------------------------------------------------------------------ renderer / scene
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0f1116);
const set = buildSet(scene);
const crew = buildCrew(scene, { filmCam: set.filmCam, keyPos: set.lights.key.position, monitorRT: set.monitor.userData.rt });
const presenter = buildPresenter(scene);   // the developer, in a small studio outside the set (camera 10)

// actors come from the stage's script (looks, start positions); rebuilt on stage change
let actors = [];
const actorById = id => actors.find(a => a.id === id);
function setActors(script) {
  for (const a of actors) { scene.remove(a.group); for (const m of a.meshes) { rmFrom(set.receivers, m); rmFrom(set.occluders, m); } }
  actors = script.actors.map((a, i) => { const api = actorFromScript(a, i); api.home = { x: api.group.position.x, z: api.group.position.z, facingDeg: THREE.MathUtils.radToDeg(api.group.rotation.y) }; return api; });
  for (const a of actors) { scene.add(a.group); set.receivers.push(...a.meshes); set.occluders.push(...a.meshes); }
  lastSpeakerId = actors[0].id; prevSpeakerId = actors[1] ? actors[1].id : actors[0].id;
}
function rmFrom(arr, m) { const i = arr.indexOf(m); if (i >= 0) arr.splice(i, 1); }

// player rig (VR) and desktop spectator camera
const rig = new THREE.Group(); rig.position.copy(OPERATOR_POS); scene.add(rig);
const xrCam = new THREE.PerspectiveCamera(70, 1, 0.05, 100); rig.add(xrCam);
xrCam.layers.enable(LAYER_CAMPROP); xrCam.layers.enable(LAYER_DEBUG);
const deskCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
deskCam.layers.enable(LAYER_CAMPROP); deskCam.layers.enable(LAYER_DEBUG);
const OP = OPERATOR_POS;
const camPresets = {
  1: () => { deskCam.position.set(OP.x - 0.05, 1.72, OP.z + 0.05); deskCam.lookAt(0, 1.4, -0.3); },
  2: () => { deskCam.position.set(3.9, 2.5, 4.0); deskCam.lookAt(0.3, 1.3, 0.0); },
  7: () => { deskCam.position.set(0.5, 2.35, 4.7); deskCam.lookAt(0.3, 1.35, 0.0); },
  3: () => { deskCam.position.set(0.6, 7.2, 1.2); deskCam.lookAt(0.4, 0, 0.1); },
  4: () => { deskCam.position.set(-1.6, 2.3, -2.0); deskCam.lookAt(1.4, 1.5, 2.4); },
  5: () => { deskCam.position.set(-2.8, 2.3, 3.3); deskCam.lookAt(0.5, 1.25, -0.3); },
  6: () => { deskCam.position.set(2.2, 1.5, 0.2); deskCam.lookAt(0.0, 1.5, 0.0); },
  9: () => { deskCam.position.set(-3.3, 3.0, 7.0); deskCam.lookAt(0.5, 0.95, 0.3); },   // "video village": director, camera, boom op and the set
};
camPresets[8] = () => {};   // headset POV: updated every frame by updateHmd()
camPresets[10] = () => { deskCam.position.copy(presenter.cam.position); deskCam.quaternion.copy(presenter.cam.quaternion); };   // presenter studio
let camMode = 2;
function setCamera(n) { if (!camPresets[n]) return; camMode = n; camPresets[n](); const fov = n === 10 ? 38 : 50; if (deskCam.fov !== fov) { deskCam.fov = fov; deskCam.updateProjectionMatrix(); } if (n === 10) deskCam.layers.enable(LAYER_STUDIO); else deskCam.layers.disable(LAYER_STUDIO); }
setCamera(camMode);

// simulated headset POV: eye height, natural head sway, gaze follows the mic/speaker, glances at the monitor, watches the director at "よーい" / "カット"
const hmdRig = new THREE.Object3D(); scene.add(hmdRig);
const hmdCam = new THREE.PerspectiveCamera(92, 16 / 9, 0.05, 100); hmdRig.add(hmdCam);
const eyeL = new THREE.PerspectiveCamera(96, 1, 0.05, 100); eyeL.position.x = -0.032; hmdRig.add(eyeL);
const eyeR = new THREE.PerspectiveCamera(96, 1, 0.05, 100); eyeR.position.x = 0.032; hmdRig.add(eyeR);
for (const cam of [hmdCam, eyeL, eyeR]) { cam.layers.enable(LAYER_CAMPROP); cam.layers.enable(LAYER_DEBUG); }
const hmdState = { gaze: new THREE.Vector3(0, 1.4, 0), glance: 0, nextGlance: 5, tmpCam: new THREE.PerspectiveCamera(), target: new THREE.Vector3() };
let stereo = false, hudShown = true, pipShown = true;
function updateHmd(dt, t, tip, mouth, lookOverride) {
  hmdRig.position.set(OP.x - 0.05 + 0.012 * Math.sin(t * 0.7) + 0.005 * Math.sin(t * 2.3), 1.62 + 0.008 * Math.sin(t * 1.1), OP.z + 0.05 + 0.01 * Math.sin(t * 0.5));
  hmdState.nextGlance -= dt;
  if (hmdState.nextGlance <= 0) { hmdState.glance = 1.3; hmdState.nextGlance = 6 + Math.random() * 5; }
  const target = hmdState.target.copy(tip).lerp(mouth, 0.5);
  if (lookOverride) target.copy(lookOverride);
  else if (hmdState.glance > 0) { hmdState.glance -= dt; target.copy(set.monitor.position); }
  target.x += 0.03 * Math.sin(t * 0.9); target.y += 0.02 * Math.sin(t * 1.7);
  hmdState.gaze.lerp(target, 1 - Math.exp(-dt * 2.5));
  hmdState.tmpCam.position.copy(hmdRig.position); hmdState.tmpCam.lookAt(hmdState.gaze); hmdRig.quaternion.copy(hmdState.tmpCam.quaternion);
}

// operator avatar for third-person shots (desktop only)
const avatar = new THREE.Group(); scene.add(avatar);
{
  const m = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: .9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .78, 6, 12), m); body.position.y = .97; body.castShadow = true; avatar.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe6c3a3 })); head.position.y = 1.64; head.castShadow = true; avatar.add(head);
  const hmd = new THREE.Mesh(new THREE.BoxGeometry(.2, .09, .1), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 })); hmd.position.set(0, 1.65, .11); avatar.add(hmd);
  const cans = new THREE.Mesh(new THREE.TorusGeometry(.14, .02, 8, 20), new THREE.MeshStandardMaterial({ color: 0x111111 })); cans.position.y = 1.66; cans.rotation.y = Math.PI / 2; avatar.add(cans);
  avatar.position.set(OP.x, 0, OP.z + 0.05);
  avatar.traverse(o => o.layers.set(LAYER_CAMPROP));
}

// ------------------------------------------------------------------ game objects
const boom = new Boom(scene);
const desk = new DesktopInput(new THREE.Vector3(OP.x, 1.95, OP.z - 0.15));
const auto = new AutoOperator(desk.pivot);
// "AI boom op": closest tip position above the speaker that is neither in frame nor shadowing the frame
const _solvePts = [], _sT = new THREE.Vector3(), _sD = new THREE.Vector3(), _sM = new THREE.Vector3();
auto.solve = (mouth, pivot) => {
  let best = null, bestD = 1e9, fallback = null, fallbackBad = 1e9;
  for (const dy of [0.42, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 1.0, 1.1]) for (const dx of [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45]) for (const dz of [-0.1, 0.1, 0.3, 0.5]) {
    _sT.set(mouth.x + dx, mouth.y + dy, mouth.z + dz); _sD.copy(_sT).sub(pivot); const len = _sD.length();
    if (len < 1.4 || len > 3.6) continue; _sD.normalize(); _sM.copy(mouth).sub(_sT).normalize();
    const r = judge.evaluate({ samplePts: samplePointsFor(pivot, _sD, len, _sT, _sM, _solvePts), tip: _sT, micDir: _sM, mouthPos: mouth, level: 'normal' });
    const bad = r.inFrameCount * 2 + r.shadowCount + (r.noiseBad ? 1 : 0);
    if (bad === 0) { if (r.dist < bestD) { bestD = r.dist; best = [dx, dy, dz]; } }
    else if (bad < fallbackBad) { fallbackBad = bad; fallback = [dx, dy, dz]; }
  }
  return best || fallback;
};
const judge = new Judge({ filmCam: set.filmCam, lights: set.shadowLights, receivers: set.receivers, occluders: set.occluders, noiseSources: set.noiseSources });
const dialogue = new Dialogue();
const score = new Score();
const hud = new Hud();
const monOverlay = new MonitorOverlay(set.monitor.userData.overlayCanvas);
const recorder = new Recorder({ glCanvas: canvas, hudCanvas: hud.canvas });
let xr = null;

// desktop DOM HUD + PIP warning
hud.canvas.id = 'hud'; Object.assign(hud.canvas.style, { position: 'fixed', left: '12px', top: '12px', width: '440px', height: '260px', zIndex: 5, pointerEvents: 'none', display: 'none' });
document.body.appendChild(hud.canvas);
const pipDiv = document.createElement('div'); Object.assign(pipDiv.style, { position: 'fixed', right: '16px', top: '16px', border: '2px solid #fff', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 5, display: 'none', color: '#ff3b30', font: '800 20px system-ui', textAlign: 'center' });
const pipWarn = document.createElement('div'); Object.assign(pipWarn.style, { position: 'absolute', left: 0, right: 0, bottom: '8px', textShadow: '0 0 6px #000' }); pipDiv.appendChild(pipWarn);
const pipTag = document.createElement('div'); Object.assign(pipTag.style, { position: 'absolute', left: '8px', top: '6px', color: '#fff', font: '600 12px system-ui', letterSpacing: '.08em', textShadow: '0 0 4px #000' }); pipTag.textContent = 'CAM A  50mm'; pipDiv.appendChild(pipTag);
document.body.appendChild(pipDiv);

// VR in-world HUD panel (wrist-ish, left-low)
const hudTex = new THREE.CanvasTexture(hud.canvas); hudTex.colorSpace = THREE.SRGBColorSpace;
const hudPanel = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5 * hud.canvas.height / hud.canvas.width), new THREE.MeshBasicMaterial({ map: hudTex, transparent: true }));
hudPanel.position.set(-0.48, 1.05, -0.80); hudPanel.rotation.set(-0.55, 0.40, 0); hudPanel.visible = false; hudPanel.layers.set(LAYER_CAMPROP); rig.add(hudPanel);

// debug markers for shadow hits
const markers = []; const markerGroup = new THREE.Group(); markerGroup.visible = false; scene.add(markerGroup);
const marker = i => { while (markers.length <= i) { const m = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); m.layers.set(LAYER_DEBUG); markerGroup.add(m); markers.push(m); } return markers[i]; };
const keyHelper = new THREE.SpotLightHelper(set.lights.key); keyHelper.visible = false; keyHelper.traverse(o => o.layers.set(LAYER_DEBUG)); scene.add(keyHelper);

// ------------------------------------------------------------------ state
let mode = 'none';          // 'desktop' | 'vr'
let phase = 'idle';         // 'idle' | 'standby' (director's call) | 'take' | 'cutting' | 'results'
let standby = null, cuttingT = 0, cutLen = 0, resultsT = 0, verdictT = 0, verdictDone = false, results = null;
let holdCut = false, verdictDelay = 1.1, narSubtitle = false;
let stageIndex = 0, firstTake = true;
let autoOn = false;
let lastPose = desk.pose();
let caption = { text: '', sub: '' };
let fps = 0, fpsAcc = 0, fpsN = 0;
let seq = null, lastRec = null, recStart = 0;
function runSequence(steps) {
  return new Promise(resolve => { seq = { steps: steps.slice().sort((a, b) => a.t - b.t), i: 0, t0: performance.now() / 1000, done: resolve }; });
}
function applyStep(s) {
  if (s.stage !== undefined) applyStage(s.stage);
  if (s.camera) setCamera(s.camera);
  if (s.auto !== undefined) autoOn = !!s.auto;
  if (s.roll !== undefined) firstTake = !!s.roll;
  if (s.holdCut !== undefined) holdCut = !!s.holdCut;
  if (s.verdictDelay !== undefined) verdictDelay = s.verdictDelay;
  if (s.say) { dialogue.say(s.say); recorder.subtitle = dialogue.sfxText[s.say] || ''; narSubtitle = true; }
  if (s.subtitle !== undefined) { recorder.subtitle = s.subtitle; narSubtitle = false; }
  if (s.callout !== undefined) recorder.callout = s.callout;
  if (s.lowerThird !== undefined) recorder.lowerThird = s.lowerThird;
  if (s.sfx === 'clap') dialogue.clap();
  if (s.noise !== undefined) { const ns = set.noiseSources.find(n => n.name === s.noise); auto.noiseTarget = ns ? ns.pos : null; }
  if (s.behavior) auto.behavior = s.behavior;
  if (s.caption !== undefined) caption = { text: s.caption, sub: s.sub || '' };
  if (s.card !== undefined) recorder.card = s.card;
  if (s.stereo !== undefined) stereo = !!s.stereo;
  if (s.take === 'start') startTake(); else if (s.take === 'cut') cut(); else if (s.take === 'abort') abortTake();
  if (s.rec === 'start') {
    const split = s.audio === 'split';                       // L = narration / R = mic, no ducking; stems captured as PCM (dialogue.setRecordRouting)
    dialogue.setRecordRouting(split ? 'split' : 'mix');
    recorder.start(s.name || 'seq', dialogue.recDest && dialogue.recDest.stream, { ...(s.opts || {}), abps: split ? 510e3 : 192e3 });
    if (split) { dialogue.startStemCapture(); recStart = dialogue.ctx.currentTime; }
  } else if (s.rec === 'stop') {
    const stems = dialogue.recMode === 'split' ? dialogue.stopStemCapture() : null, nm = recorder.name;
    recorder.stop().then(async r => {
      lastRec = r;
      if (stems) { const blob = await stems; const q = await fetch(`/__save?name=${encodeURIComponent(nm + '_stems.wav')}`, { method: 'POST', body: blob }); lastRec = { ...r, stems: { ...(await q.json().catch(() => ({}))), bytes: blob.size, recStart, capT0: dialogue.stemT0, capStart: dialogue.stemStart } }; }
      dialogue.setRecordRouting('mix');
    });
  }
  if (s.frameLines !== undefined) set.frameLines.visible = !!s.frameLines;
  if (s.markers !== undefined) markerGroup.visible = !!s.markers;
  if (s.hud !== undefined) { hudShown = !!s.hud; hud.canvas.style.display = s.hud ? 'block' : 'none'; recorder.showHud = !!s.hud; }
  if (s.fn) s.fn();
}
const mouthPos = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
let lastSpeakerId = 'A', prevSpeakerId = 'B';

const overlay = document.getElementById('overlay'), helpEl = document.getElementById('help'), dbgEl = document.getElementById('dbg');

// ------------------------------------------------------------------ stages
async function preloadAll() {
  for (const st of STAGES) { try { await dialogue.loadScript(st.script); } catch (e) { console.warn('stage not available:', st.script, e.message); } }
  if (!dialogue.sfx.cut) { try { await dialogue.loadSfx(DIRECTOR_URL); } catch (e) { console.warn('director voices not available:', e.message); } }
  if (!dialogue.sfx.p01) { try { await dialogue.loadSfx(PRESENTER_URL); } catch (e) { console.warn('presenter narration not available:', e.message); } }
}
function applyStage(i) {
  const st = STAGES[i]; if (!dialogue.cache.has(st.script)) { console.warn('stage not loaded', st.script); return false; }
  stageIndex = i;
  const script = dialogue.use(st.script);
  setActors(script); score.reset(script);
  phase = 'idle'; results = null; standby = null; firstTake = true; auto._init = false; auto._lastSolveMouth.set(1e9, 0, 0);
  return true;
}
async function setStage(i) { i = ((i % STAGES.length) + STAGES.length) % STAGES.length; await dialogue.loadScript(STAGES[i].script).catch(e => console.warn(e)); return applyStage(i); }

async function boot() {
  try { await dialogue.loadScript(STAGES[0].script); applyStage(0); } catch (e) { console.warn('script.json / audio not available yet:', e); }
  try { await dialogue.loadSfx(DIRECTOR_URL); } catch (e) { console.warn('director voices not available yet:', e.message); }
  try { await dialogue.loadSfx(PRESENTER_URL); } catch (e) { console.warn('presenter narration not available yet:', e.message); }
  dialogue.setNoiseSources(set.noiseSources);
  if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) document.getElementById('btnVR').disabled = false;
  preloadAll();
}
boot();

function startDesktop() {
  mode = 'desktop'; overlay.style.display = 'none'; hud.canvas.style.display = 'block'; pipDiv.style.display = 'block'; helpEl.classList.remove('hidden');
  dialogue.ensureCtx().resume();
}
async function startVR() {
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');
  await renderer.xr.setSession(session);
  xr = xr || new XRInput(renderer, scene, rig);
  xr.onButton = b => {
    if (b === 'take') toggleTake();
    else if (b === 'mode') { xr.mode = xr.mode === 'two-hand' ? 'pole' : 'two-hand'; }
    else if (b === 'calibrate') { xr.calibratePole(tmpV.set(0, 0, -1)); }
    else if (b === 'camera') { if (phase === 'idle' || phase === 'results') setStage(stageIndex + 1); }
  };
  mode = 'vr'; overlay.style.display = 'none'; hudPanel.visible = true; hud.canvas.style.display = 'none'; pipDiv.style.display = 'none';
  dialogue.ensureCtx().resume();
  session.addEventListener('end', () => { renderer.xr.enabled = false; mode = 'desktop'; hudPanel.visible = false; hud.canvas.style.display = 'block'; pipDiv.style.display = 'block'; });
}
document.getElementById('btnDesktop').onclick = startDesktop;
document.getElementById('btnVR').onclick = () => startVR().catch(e => alert('VR start failed: ' + e.message));

// ------------------------------------------------------------------ take flow: director's call → take → "cut" → results → verdict
function startTake() {
  if (!dialogue.script) return;
  dialogue.stop(); score.reset(dialogue.script); results = null; verdictDone = false;
  for (const a of actors) a.place(a.home.x, a.home.z, a.home.facingDeg);
  for (const b of dialogue.blocking || []) b.done = false;
  phase = 'standby'; standby = { plan: standbyPlan(dialogue, { roll: firstTake }), t: 0, i: 0 }; firstTake = false;
}
function fireStandby(id) {
  if (id === 'roll' || id === 'ready' || id === 'slate' || id === 'action') dialogue.playSfx(id);
  else if (id === 'slateIn') crew.slate('in');
  else if (id === 'clap') { dialogue.clap(); crew.slate('clap'); }
  else if (id === 'slateOut') crew.slate('out');
}
function cut() {
  dialogue.stop(); results = score.results();
  if (phase === 'standby') { crew.slate('out'); phase = 'idle'; standby = null; return; }   // aborted before "action"
  phase = 'cutting'; cuttingT = 0; cutLen = dialogue.sfxDuration('cut') + 0.35; dialogue.playSfx('cut');
}
function abortTake() { dialogue.stop(); crew.slate('out'); phase = 'idle'; standby = null; results = null; for (const a of actors) a.place(a.home.x, a.home.z, a.home.facingDeg); }
function toggleTake() { if (phase === 'take' || phase === 'standby') cut(); else if (phase === 'idle' || phase === 'results') startTake(); }

desk.onKey = (key) => {
  const k = key.toLowerCase();
  if (camPresets[key]) setCamera(+key);
  else if (k === 'p') autoOn = !autoOn;
  else if (k === 'o') stereo = !stereo;
  else if (k === 'n') { if (phase === 'idle' || phase === 'results') setStage(stageIndex + 1); }
  else if (k === 'l') keyHelper.visible = !keyHelper.visible;
  else if (k === 'f') set.frameLines.visible = !set.frameLines.visible;
  else if (k === 'm') markerGroup.visible = !markerGroup.visible;
  else if (k === 'h') helpEl.classList.toggle('hidden');
  else if (k === 'i') dbgEl.classList.toggle('hidden');
  else if (k === ' ') toggleTake();
};

// ------------------------------------------------------------------ frame loop
let prevT = performance.now();
function loop(timeMs, frame) {
  const now = performance.now(); const dt = Math.min((now - prevT) / 1000, 0.05); prevT = now; const t = now / 1000;
  fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  if (mode === 'none') { renderer.render(scene, deskCam); return; }
  if (seq) { const el = t - seq.t0; while (seq.i < seq.steps.length && seq.steps[seq.i].t <= el) applyStep(seq.steps[seq.i++]); if (seq.i >= seq.steps.length) { seq.done(); seq = null; } }

  // --- take state machine
  let lookDirector = false;
  if (phase === 'standby' && standby) {
    standby.t += dt; const ev = standby.plan.events;
    while (standby.i < ev.length && ev[standby.i].t <= standby.t) fireStandby(ev[standby.i++].id);
    lookDirector = standby.i < ev.length;   // watch the director until 「スタート！」 has been called
    if (standby.t >= standby.plan.total) { phase = 'take'; dialogue.start(DIALOGUE_LEAD); standby = null; }
  }
  const cur = dialogue.update();
  if (phase === 'take') {
    if (dialogue.finished && !holdCut) cut();
    else for (const b of dialogue.blocking || []) if (!b.done && dialogue.elapsed >= b.t) { b.done = true; const a = actorById(b.actor); if (a) a.moveTo({ x: b.to[0], z: b.to[1], facingDeg: b.to[2], dur: b.dur ?? 2 }); }
  }
  if (phase === 'cutting') { lookDirector = true; cuttingT += dt; if (cuttingT >= cutLen) { phase = 'results'; resultsT = 16; verdictT = verdictDelay; } }
  if (phase === 'results') {
    resultsT -= dt; verdictT -= dt;
    if (!verdictDone && verdictT <= 0) { verdictDone = true; dialogue.playSfx(verdictId(results.rank)); }
    if (dialogue.sfxNow && dialogue.sfxNow !== 'slate') lookDirector = true;
    if (resultsT <= 0) phase = 'idle';
  }

  // --- actors: speaker's mouth moves, everyone looks at the speaker (the speaker looks at whoever spoke before)
  const sp = cur ? actorById(cur.actorId) : null;
  if (sp && sp.id !== lastSpeakerId) { prevSpeakerId = lastSpeakerId; lastSpeakerId = sp.id; }
  const target = sp || actorById(lastSpeakerId) || actors[0];
  for (const a of actors) {
    a.update(dt);
    let lookAt = null;
    if (sp && a !== sp) lookAt = sp.headTop.getWorldPosition(tmpV);
    else { const other = actorById(prevSpeakerId !== a.id ? prevSpeakerId : lastSpeakerId) || actors.find(o => o !== a); if (other && other !== a) lookAt = other.headTop.getWorldPosition(tmpV); }
    a.setMouth(a === sp ? dialogue.amplitude : 0);
    a.idle(t, a === sp, a.walking ? null : lookAt);
  }
  if (target) target.mouth.getWorldPosition(mouthPos);
  const sfxNow = dialogue.sfxNow;
  crew.update(dt, t, { directorAmp: sfxNow && sfxNow !== 'slate' ? dialogue.sfxAmp : 0, acAmp: sfxNow === 'slate' ? dialogue.sfxAmp : 0, speakerPos: mouthPos, rolling: phase === 'take' });
  presenter.update(dt, t, dialogue.narAmp);
  if (narSubtitle && !dialogue.narNow) { recorder.subtitle = ''; narSubtitle = false; }

  // --- boom pose
  let pose = null;
  if (mode === 'vr' && xr) { xr.update(dt); pose = xr.pose(); }
  else { desk.update(dt); pose = autoOn ? auto.update(dt, mouthPos, judge.result) : desk.pose(); }
  if (pose) lastPose = pose;
  boom.setPose(lastPose);
  avatar.visible = mode === 'desktop' && camMode !== 1 && camMode !== 8;
  if (mode === 'desktop' && camMode === 8) updateHmd(dt, t, boom.tip, mouthPos, lookDirector ? crew.directorHead() : null);
  hudPanel.visible = mode === 'vr' || (mode === 'desktop' && camMode === 8);
  avatar.rotation.y = Math.atan2(lastPose.dir.x, -lastPose.dir.z) * 0.6;
  if (mode === 'desktop' && camMode === 1) camPresets[1]();

  // --- judge + score + audio
  const j = judge.evaluate({ samplePts: boom.samplePoints(), tip: boom.tip, micDir: boom.micDir, mouthPos, level: cur ? cur.line.level : 'normal' });
  if (phase === 'take') score.update(dt, cur, j);
  dialogue.setPickup(j);
  for (const m of markers) m.visible = false;
  if (markerGroup.visible) j.shadowHits.forEach((p, i) => { const m = marker(i); m.position.copy(p); m.visible = true; });

  // --- UI
  const warn = j.shadowInFrame ? 'SHADOW NG' : j.inFrame ? 'BOOM IN FRAME' : (j.noiseBad ? 'NOISE' : '');
  const st = STAGES[stageIndex];
  hud.draw({
    phase, score: score.score, rate: phase === 'take' ? score.rate : 0, stageTag: st ? `${st.tag}  ${st.title}` : '',
    speakerName: sp ? sp.name : (phase === 'standby' ? '監督' : ''), level: cur ? cur.line.level : '',
    lineText: cur ? cur.line.text : phase === 'standby' ? 'よーい……' : phase === 'cutting' ? 'カット！' : (phase === 'idle' ? (mode === 'vr' ? 'A ボタンで本番（監督に合図）' : 'Space で本番（監督に合図）') : ''),
    angleDeg: j.angleDeg, dirScore: j.dirScore, dist: j.dist, distScore: j.distScore,
    inFrame: j.inFrame, shadowInFrame: j.shadowInFrame, contact: j.contact, noiseBad: j.noiseBad, noiseName: j.noiseIndex >= 0 ? set.noiseSources[j.noiseIndex].name : '',
    timeLeft: phase === 'take' ? dialogue.duration - dialogue.elapsed : 0, results,
    footer: mode === 'vr' ? `${xr && xr.mode === 'pole' ? 'POLE' : 'TWO-HAND'} mode   B: モード切替  X: ポール較正  Y: ステージ` : (autoOn ? 'AI ブームオペ（オートデモ）   ブーム長 ' + lastPose.len.toFixed(2) + ' m' : 'ブーム長 ' + lastPose.len.toFixed(2) + ' m   N: ステージ切替'),
  });
  hudTex.needsUpdate = true;
  monOverlay.draw({ inFrame: j.inFrame, shadowInFrame: j.shadowInFrame, rec: phase === 'take' || phase === 'standby' });
  set.monitor.userData.overlayTex.needsUpdate = true;
  pipDiv.style.borderColor = warn ? (warn === 'NOISE' ? '#ff9500' : '#ff3b30') : '#fff'; pipWarn.textContent = warn === 'NOISE' ? '' : warn;
  if (!dbgEl.classList.contains('hidden')) dbgEl.textContent = `fps ${fps.toFixed(0)}  angle ${j.angleDeg.toFixed(1)}  dist ${j.dist.toFixed(2)}  frame ${j.inFrameCount}  shadow ${j.shadowCount}  noise ${j.noiseMax.toFixed(2)}  phase ${phase}  t ${dialogue.elapsed.toFixed(1)}  stage ${stageIndex + 1}`;

  // --- render: on-set monitor (film camera → texture), then the player's view (+ PIP on desktop)
  keyHelper.update();
  const xrWas = renderer.xr.enabled; const prevRT = renderer.getRenderTarget();
  renderer.xr.enabled = false; renderer.setRenderTarget(set.monitor.userData.rt); renderer.render(scene, set.filmCam);
  renderer.setRenderTarget(prevRT); renderer.xr.enabled = xrWas;

  if (mode === 'vr' && renderer.xr.isPresenting) {
    renderer.render(scene, xrCam);
  } else {
    const w = innerWidth, h = innerHeight;
    renderer.setScissorTest(true);
    const isStereo = camMode === 8 && stereo;
    let pw = 0, ph = 0, px = 0, py = 16;
    if (isStereo) {
      const hw = Math.floor(w / 2);
      eyeL.aspect = hw / h; eyeL.updateProjectionMatrix(); eyeR.aspect = (w - hw) / h; eyeR.updateProjectionMatrix();
      renderer.setViewport(0, 0, hw, h); renderer.setScissor(0, 0, hw, h); renderer.render(scene, eyeL);
      renderer.setViewport(hw, 0, w - hw, h); renderer.setScissor(hw, 0, w - hw, h); renderer.render(scene, eyeR);
      pipDiv.style.display = 'none';
    } else {
      const cam = camMode === 8 ? hmdCam : deskCam;
      if (camMode === 8) { hmdCam.aspect = w / h; hmdCam.updateProjectionMatrix(); }
      renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.render(scene, cam);
      if (camMode === 8 || camMode === 10 || !pipShown) { pipDiv.style.display = 'none'; }   // headset view: the on-set monitor is in the scene itself; studio: no PIP
      else {
        pw = Math.round(w * 0.30); ph = Math.round(pw * 9 / 16); px = w - pw - 16;
        renderer.setViewport(px, h - ph - py, pw, ph); renderer.setScissor(px, h - ph - py, pw, ph); renderer.clearDepth(); renderer.render(scene, set.filmCam);
        pipDiv.style.display = 'block'; pipDiv.style.width = pw + 'px'; pipDiv.style.height = ph + 'px';
      }
    }
    renderer.setScissorTest(false);
    {
      const sx = recorder.canvas.width / w, sy = recorder.canvas.height / h;
      recorder.pip = (isStereo || camMode === 8 || camMode === 10 || !pipShown) ? null : { x: px * sx, y: py * sy, w: pw * sx, h: ph * sy }; recorder.warn = warn === 'NOISE' ? '' : warn;
      recorder.hmdMask = camMode === 8 ? (isStereo ? 'stereo' : 'mono') : null;
      recorder.showHud = hudShown && !isStereo;
      recorder.caption = caption.text; recorder.captionSub = caption.sub;
      if (recorder.active) recorder.compose();
    }
  }
}
renderer.setAnimationLoop(loop);

function resize() { renderer.setSize(innerWidth, innerHeight, false); deskCam.aspect = innerWidth / innerHeight; deskCam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ automation API (used for verification + video capture)
window.__game = {
  mode: () => mode, phase: () => phase, stage: () => stageIndex, stages: STAGES,
  start: startDesktop, startTake, cut, toggleTake, setStage, preloadAll,
  setAuto(on, behavior) { autoOn = !!on; if (behavior) auto.behavior = behavior; },
  aimNoise(name) { const ns = set.noiseSources.find(n => n.name === name); auto.noiseTarget = ns ? ns.pos : null; auto.behavior = ns ? 'noise' : 'good'; },
  setCamera(n) { setCamera(n); },
  say: id => dialogue.say(id), narration: () => ({ now: dialogue.narNow, amp: +dialogue.narAmp.toFixed(2) }), abortTake,
  overlay(o) { if (o.callout !== undefined) recorder.callout = o.callout; if (o.subtitle !== undefined) recorder.subtitle = o.subtitle; if (o.lowerThird !== undefined) recorder.lowerThird = o.lowerThird; },
  setMouse(nx, ny) { desk.setMouse(nx, ny); },
  setDesktop(o) { Object.assign(desk, o); },
  caption(text = '', sub = '') { caption = { text, sub }; },
  hud(show) { hudShown = !!show; hud.canvas.style.display = show ? 'block' : 'none'; recorder.showHud = !!show; },
  pip(show) { pipShown = !!show; },
  setStereo(v) { stereo = !!v; }, card(c) { recorder.card = c; },
  help(show) { helpEl.classList.toggle('hidden', !show); },
  frameLines(v) { set.frameLines.visible = v; }, markers(v) { markerGroup.visible = v; },
  setPixelRatio(r) { renderer.setPixelRatio(r); resize(); },
  record: { start: (name, opts) => recorder.start(name, dialogue.recDest && dialogue.recDest.stream, opts), stop: () => recorder.stop(), active: () => recorder.active },
  screenshot: name => recorder.screenshot(name),
  sequence: runSequence, lastRec: () => lastRec, seqActive: () => !!seq,
  runAward: async (opts = {}) => { await preloadAll(); if (opts.audio === 'split') await dialogue.prepareStemCapture(); return runSequence(awardSequence(dialogue, { ...opts, stages: STAGES })); },
  awardSteps: async (opts) => { await preloadAll(); return awardSequence(dialogue, { ...opts, stages: STAGES }); },
  prepareSplit: () => dialogue.prepareStemCapture(),   // split-audio recording: set up the stem capture before a custom sequence
  state() {
    const j = judge.result;
    return { mode, phase, stage: stageIndex + 1, fps: +fps.toFixed(1), amp: +dialogue.amplitude.toFixed(2), sfx: dialogue.sfxNow, score: Math.round(score.score), rate: Math.round(score.rate), elapsed: +dialogue.elapsed.toFixed(2), duration: +dialogue.duration.toFixed(2),
      line: dialogue.current ? { index: dialogue.current.index, actor: dialogue.current.actorId, text: dialogue.current.line.text, level: dialogue.current.line.level } : null,
      angleDeg: +j.angleDeg.toFixed(1), dist: +j.dist.toFixed(2), dirScore: +j.dirScore.toFixed(2), distScore: +j.distScore.toFixed(2),
      inFrame: j.inFrame, inFrameCount: j.inFrameCount, shadowInFrame: j.shadowInFrame, shadowCount: j.shadowCount, contact: j.contact, noiseMax: +j.noiseMax.toFixed(2), noiseBad: j.noiseBad,
      actors: actors.map(a => ({ id: a.id, x: +a.group.position.x.toFixed(2), z: +a.group.position.z.toFixed(2), walking: a.walking })),
      boom: { len: +lastPose.len.toFixed(2), tip: boom.tip.toArray().map(v => +v.toFixed(2)) }, auto: autoOn, autoBehavior: auto.behavior, results };
  },
};
