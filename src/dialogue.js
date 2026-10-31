// Dialogue playback + the "what the mic hears" audio chain (Web Audio).
//
//   voices ─┬─ direct leakage (you always hear the room a little) ───────────────────────┐
//           ├─ mic direct pickup: gain(θ, d) → high-shelf cut(θ) → low-pass(θ) ─────┐    │
//           └─ room send → convolver (room IR) → low-pass → room gain(d) ───────────┤    │
//   room tone (pink) + mic self-noise (white) ──────────────────────────────────────┤    │
//   noise sources (hum / traffic): gain = pickup(θ_src, d_src) ───────────────────┤    │
//   director / slate (sfx) ── leak ───────────────────────────────────────────────┴→ micBus → limiter ─┤
//                         └─ direct ─────────────────────────────────────────────────────────────────┴→ master → speakers + recorder
const SPLIT_TRIM = 0.5;   // -6 dB on each channel of the split recording: the un-limited mic bus must not clip the 16-bit recorder path

export class Dialogue {
  constructor() {
    this.ctx = null; this.script = null; this.buffers = []; this.timeline = []; this.url = null;
    this.playing = false; this.t0 = 0; this.duration = 0;
    this.current = null;      // { index, line, actorId, progress }
    this.amplitude = 0;       // 0..1 from the dry bus, drives the speaker's mouth
    this.sfxAmp = 0;          // 0..1 from the sfx bus (director's mouth)
    this._td = null; this._tdS = null;
    this.cache = new Map();   // url → { script, buffers, timeline, duration }
    this.sfx = {};            // id → AudioBuffer
    this.sfxNow = null;       // id of the one-shot currently playing (director / slate)
    this.sfxText = {};        // id → text (for subtitles)
    this.narNow = null; this.narAmp = 0; this.duckLevel = 0.22;
    this.noise = [];          // [{ gain }] per noise source
    this.duckEnabled = true; this.recMode = 'mix'; this.stemReady = false;   // recording routing: 'mix' (what you hear) or 'split' (L narration / R mic, no ducking) + PCM stem capture
  }

  ensureCtx() {
    if (this.ctx) return this.ctx;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    // master → limiter (like the mixer's limiter in a real bag; also keeps the slate clap and the director's shout from clipping the recording)
    this.master = g(1);
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -9; this.limiter.knee.value = 4; this.limiter.ratio.value = 12; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.15;
    this.out = g(0.95);
    this.master.connect(this.limiter).connect(this.out).connect(ctx.destination);
    this.recDest = ctx.createMediaStreamDestination(); this.out.connect(this.recDest);
    this.duck = g(1); this.duck.connect(this.master);   // everything that is "the game" passes through here (ducked under narration)
    this.micBus = g(1);

    // --- voices
    this.dryBus = g(1);
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024; this._td = new Float32Array(this.analyser.fftSize);
    this.dryBus.connect(this.analyser);
    this.roomBus = g(1); this.roomBus.connect(this.duck);   // what you hear with your own ears, not through the mic: the actors' leakage, the director, the slate, the noise items
    this.directGain = g(0.14); this.dryBus.connect(this.directGain).connect(this.roomBus);         // acoustic leakage
    // mic direct pickup: directivity/distance gain → off-axis high-shelf cut → off-axis low-pass
    this.pickupGain = g(0.2);
    this.shelf = ctx.createBiquadFilter(); this.shelf.type = 'highshelf'; this.shelf.frequency.value = 3200; this.shelf.gain.value = 0;
    this.pickupFilter = ctx.createBiquadFilter(); this.pickupFilter.type = 'lowpass'; this.pickupFilter.frequency.value = 12000; this.pickupFilter.Q.value = 0.6;
    this.dryBus.connect(this.pickupGain).connect(this.shelf).connect(this.pickupFilter).connect(this.micBus);
    // room: the diffuse field does not care where the mic points; it is heard most when the direct sound is weak (far / off-axis)
    this.roomSend = g(1.0); this.convolver = ctx.createConvolver(); this.convolver.buffer = makeRoomIR(ctx, 1.15);
    this.roomLP = ctx.createBiquadFilter(); this.roomLP.type = 'lowpass'; this.roomLP.frequency.value = 4200; this.roomLP.Q.value = 0.5;
    this.roomGain = g(0.11);
    this.dryBus.connect(this.roomSend).connect(this.convolver).connect(this.roomLP).connect(this.roomGain).connect(this.micBus);

    // --- noise floor: room tone (air handling) + mic/preamp hiss
    this.floor = loopNoise(ctx, 'pink', 6); this.floorLP = ctx.createBiquadFilter(); this.floorLP.type = 'lowpass'; this.floorLP.frequency.value = 900;
    this.floorGain = g(0.028); this.floor.connect(this.floorLP).connect(this.floorGain).connect(this.micBus);
    this.hiss = loopNoise(ctx, 'white', 4); this.hissHP = ctx.createBiquadFilter(); this.hissHP.type = 'highpass'; this.hissHP.frequency.value = 3000;
    this.hissGain = g(0.0045); this.hiss.connect(this.hissHP).connect(this.hissGain).connect(this.micBus);

    // --- narration (presenter's voice-over): straight to the master, ducks the game while it plays
    this.voBus = g(1); this.voAnalyser = ctx.createAnalyser(); this.voAnalyser.fftSize = 1024; this._tdV = new Float32Array(this.voAnalyser.fftSize);
    this.voBus.connect(this.voAnalyser); this.voGain = g(0.9); this.voBus.connect(this.voGain).connect(this.master);
    // --- sfx (director's voice, slate): heard directly, and a little through the mic
    this.sfxBus = g(1);
    this.sfxAnalyser = ctx.createAnalyser(); this.sfxAnalyser.fftSize = 1024; this._tdS = new Float32Array(this.sfxAnalyser.fftSize);
    this.sfxBus.connect(this.sfxAnalyser);
    this.sfxDirect = g(0.55); this.sfxBus.connect(this.sfxDirect).connect(this.roomBus);
    this.micBus.connect(this.duck);
    this.sfxLeak = g(0.16); this.sfxBus.connect(this.sfxLeak).connect(this.micBus);
    return ctx;
  }

  // Noise source items in the set: builds a generator per source; the per-frame pickup sets each gain.
  setNoiseSources(sources) {
    const ctx = this.ensureCtx();
    for (const n of this.noise) { try { n.out.disconnect(); } catch {} }
    this.noise = sources.map(src => {
      const out = ctx.createGain(); out.gain.value = 0;
      const leak = ctx.createGain(); leak.gain.value = 0.012 * (src.level ?? 1);   // you hear it faintly in the room anyway
      const node = src.kind === 'hum' ? makeHum(ctx) : makeTraffic(ctx);
      node.connect(out).connect(this.micBus); node.connect(leak).connect(this.roomBus);
      return { out, leak, kind: src.kind, name: src.name };
    });
  }

  async loadScript(url) {
    if (this.cache.has(url)) return this.cache.get(url);
    const ctx = this.ensureCtx();
    const script = await (await fetch(url)).json();
    const buffers = await Promise.all(script.lines.map(async l => ctx.decodeAudioData(await (await fetch('./' + l.file)).arrayBuffer())));
    let t = 0; const timeline = script.lines.map((line, i) => { const d = buffers[i].duration; const e = { index: i, line, start: t, end: t + d }; t += d + (line.gapAfter ?? 0.5); return e; });
    // blocking (movement) entries may reference a line: { atLine, offset } → absolute t
    const blocking = (script.blocking || []).map(b => ({ ...b, t: b.t ?? ((timeline[b.atLine]?.start ?? 0) + (b.offset ?? 0)) }));
    const entry = { script, buffers, timeline, duration: t, blocking };
    this.cache.set(url, entry); return entry;
  }
  use(url) { const e = this.cache.get(url); if (!e) throw new Error('script not loaded: ' + url); this.stop(); this.url = url; this.script = e.script; this.buffers = e.buffers; this.timeline = e.timeline; this.duration = e.duration; this.blocking = e.blocking; return e.script; }
  async load(url = './script.json') { await this.loadScript(url); return this.use(url); }

  async loadSfx(url) {
    const ctx = this.ensureCtx();
    const j = await (await fetch(url)).json();
    await Promise.all(j.lines.map(async l => { this.sfx[l.id] = await ctx.decodeAudioData(await (await fetch('./' + l.file)).arrayBuffer()); this.sfxText[l.id] = l.display || l.text; }));
    this.sfxScript = j; return j;
  }
  sfxDuration(id) { return this.sfx[id] ? this.sfx[id].duration : 0.6; }
  // Play a one-shot (director's line etc.). Resolves with the buffer duration when it ends.
  playSfx(id, { gain = 1, when = 0 } = {}) {
    const ctx = this.ensureCtx(); const b = this.sfx[id];
    if (!b) return Promise.resolve(0);
    if (ctx.state === 'suspended') ctx.resume();
    const s = ctx.createBufferSource(); s.buffer = b; const gn = ctx.createGain(); gn.gain.value = gain;
    s.connect(gn).connect(this.sfxBus); s.start(ctx.currentTime + when);
    this.sfxNow = id;
    return new Promise(res => { s.onended = () => { if (this.sfxNow === id) this.sfxNow = null; res(b.duration); }; });
  }
  // Narration line (presenter). The game audio ducks while it plays; resolves when it ends.
  say(id, { gain = 1 } = {}) {
    const ctx = this.ensureCtx(); const b = this.sfx[id];
    if (!b) return Promise.resolve(0);
    if (ctx.state === 'suspended') ctx.resume();
    const s = ctx.createBufferSource(); s.buffer = b; const gn = ctx.createGain(); gn.gain.value = gain;
    s.connect(gn).connect(this.voBus); s.start();
    this.narNow = id; if (this.duckEnabled) this.duck.gain.setTargetAtTime(this.duckLevel, ctx.currentTime, 0.08);
    return new Promise(res => { s.onended = () => { if (this.narNow === id) { this.narNow = null; if (this.duckEnabled) this.duck.gain.setTargetAtTime(1, ctx.currentTime + 0.25, 0.25); } res(b.duration); }; });
  }
  // Slate clap: synthesised click (noise burst + wood thud), loud enough to tickle the limiter like the real thing.
  clap({ when = 0 } = {}) {
    const ctx = this.ensureCtx(); const rate = ctx.sampleRate, n = Math.floor(rate * 0.12);
    const buf = ctx.createBuffer(1, n, rate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { const t = i / rate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 70) * 0.9 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 40) * 0.6; }
    const s = ctx.createBufferSource(); s.buffer = buf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.5;
    const gn = ctx.createGain(); gn.gain.value = 1.0; s.connect(bp).connect(gn).connect(this.sfxBus); s.connect(gn); s.start(ctx.currentTime + when);
  }

  // ── recording routing. 'mix': the recorder gets what you hear (master → limiter → out). 'split': L = narration, R = what the gun mic
  // hears, each on its own channel, no ducking and no limiter, so the sound can be mixed afterwards in a DAW.
  setRecordRouting(mode = 'mix') {
    const ctx = this.ensureCtx(); if (this.recMode === mode) return mode;
    const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    if (this.recMode === 'split') { try { this.splitMerger.disconnect(); this.splitNar.disconnect(); this.splitMic.disconnect(); } catch {} this.splitMerger = null; }
    else { try { this.out.disconnect(this.recDest); } catch {} }
    if (mode === 'split') {
      const m = this.splitMerger = ctx.createChannelMerger(2);
      this.splitNar = g(0.9 * SPLIT_TRIM); this.voBus.connect(this.splitNar).connect(m, 0, 0);   // L: narration at its mix level
      this.splitMic = g(SPLIT_TRIM); this.micBus.connect(this.splitMic).connect(m, 0, 1);         // R: the mic bus (pickup + room + noise floor + noise items + the director's leak)
      m.connect(this.recDest);
    } else this.out.connect(this.recDest);
    this.recMode = mode; this.duckEnabled = mode !== 'split';
    if (!this.duckEnabled) this.duck.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
    return mode;
  }
  // ── stem capture (split mode): an AudioWorklet records narration / mic / room as 32-bit float PCM, 3 channels → WAV (lossless, no trim).
  async prepareStemCapture() {
    const ctx = this.ensureCtx(); if (this.stemReady) return;
    const src = `class Cap extends AudioWorkletProcessor {
      constructor() { super(); this.buf = []; this.n = 0; this.on = false; this.port.onmessage = e => { if (e.data === 'start') { this.on = true; this.first = true; } else if (e.data === 'stop') { this.on = false; this.flush(true); } }; }
      flush(final) { const bufs = []; for (const c of this.buf) for (const a of c) bufs.push(a.buffer); this.port.postMessage({ chunks: this.buf, n: this.n, final }, bufs); this.buf = []; this.n = 0; }
      process(inputs) {
        if (!this.on) return true;
        if (this.first) { this.first = false; this.port.postMessage({ start: currentTime }); }
        const inp = inputs[0] || []; const chans = [0, 1, 2].map(i => inp[i] ? inp[i].slice() : new Float32Array(128));
        this.buf.push(chans); this.n += chans[0].length; if (this.n >= sampleRate) this.flush(false); return true;
      } }
      registerProcessor('stem-capture', Cap);`;
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
    const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const m = ctx.createChannelMerger(3);
    this.capNar = g(0.9); this.voBus.connect(this.capNar).connect(m, 0, 0);   // ch1 narration (mix level)
    this.micBus.connect(m, 0, 1);                                             // ch2 the gun mic
    this.roomBus.connect(m, 0, 2);                                            // ch3 the room (director, slate, leakage)
    this.stemNode = new AudioWorkletNode(ctx, 'stem-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 3, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
    m.connect(this.stemNode); const sink = g(0); this.stemNode.connect(sink).connect(ctx.destination);
    this.stemChunks = []; this.stemN = 0; this.stemStart = null;
    this.stemNode.port.onmessage = e => { const d = e.data; if (d.start !== undefined) this.stemStart = d.start; if (d.chunks) { for (const c of d.chunks) this.stemChunks.push(c); this.stemN += d.n; if (d.final && this._stemDone) this._stemDone(); } };
    this.stemReady = true;
  }
  startStemCapture() { if (!this.stemReady) return false; this.stemChunks = []; this.stemN = 0; this.stemStart = null; this.stemT0 = this.ctx.currentTime; this.stemNode.port.postMessage('start'); return true; }
  // Resolves with a WAV Blob (48 kHz, 3 ch, 32-bit float): ch1 narration, ch2 mic, ch3 room.
  stopStemCapture() {
    if (!this.stemReady) return null;
    return new Promise(res => { this._stemDone = () => { this._stemDone = null; res(this._stemWav()); }; this.stemNode.port.postMessage('stop'); });
  }
  _stemWav() {
    const ch = 3, n = this.stemN, rate = this.ctx.sampleRate, bytes = n * ch * 4;
    const buf = new ArrayBuffer(44 + bytes), v = new DataView(buf); const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, ch, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 4, true); v.setUint16(32, ch * 4, true); v.setUint16(34, 32, true); w(36, 'data'); v.setUint32(40, bytes, true);
    const out = new Float32Array(buf, 44, n * ch); let p = 0;
    for (const c of this.stemChunks) { const len = c[0].length; for (let i = 0; i < len; i++) { out[p++] = c[0][i]; out[p++] = c[1][i]; out[p++] = c[2][i]; } }
    this.stemChunks = [];
    return new Blob([buf], { type: 'audio/wav' });
  }

  actorOf(line) { return this.script.actors.find(a => a.id === line.actor); }

  start(lead = 0.25) {
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    this.stop();
    this.playing = true; this.t0 = ctx.currentTime + lead;
    this.sources = this.timeline.map((e, i) => { const s = ctx.createBufferSource(); s.buffer = this.buffers[i]; s.connect(this.dryBus); s.start(this.t0 + e.start); return s; });
  }
  stop() { if (this.sources) for (const s of this.sources) { try { s.stop(); } catch {} } this.sources = null; this.playing = false; this.current = null; }

  get elapsed() { return this.playing ? this.ctx.currentTime - this.t0 : 0; }
  get finished() { return this.playing && this.elapsed > this.duration; }

  // Which line is speaking right now? Also the amplitude of the dry voice for mouth animation.
  update() {
    this.current = null;
    if (this.playing) {
      const t = this.elapsed;
      const e = this.timeline.find(e => t >= e.start && t < e.end);
      if (e) this.current = { index: e.index, line: e.line, actorId: e.line.actor, progress: (t - e.start) / (e.end - e.start) };
      this.amplitude = Math.min(1, Math.pow(rms(this.analyser, this._td) * 3.0, 0.8));
    } else this.amplitude = 0;
    this.sfxAmp = this.ctx ? Math.min(1, Math.pow(rms(this.sfxAnalyser, this._tdS) * 3.0, 0.8)) : 0;
    this.narAmp = this.ctx ? Math.min(1, Math.pow(rms(this.voAnalyser, this._tdV) * 3.0, 0.8)) : 0;
    return this.current;
  }

  // Feed the judge result into the pickup chain.
  //  on-axis & close → full-band, loud, dry.   off-axis / far → quieter, highs rolled off, more room, noise floor and noise sources stand out.
  setPickup({ dirScore, dist, noise = [] }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dg = Math.pow(Math.min(1, 0.35 / Math.max(dist, 0.05)), 0.75);          // inverse distance, reference 35 cm
    const gain = 0.05 + 1.15 * dirScore * dg;
    const lp = 1300 + (16000 - 1300) * Math.pow(dirScore, 0.55);                   // interference tube: highs collapse off-axis
    const shelf = -13 * (1 - dirScore);
    const room = 0.08 + 0.10 * Math.min(1, Math.max(0, (dist - 0.3) / 1.5));
    this.pickupGain.gain.setTargetAtTime(gain, t, 0.04);
    this.pickupFilter.frequency.setTargetAtTime(lp, t, 0.04);
    this.shelf.gain.setTargetAtTime(shelf, t, 0.04);
    this.roomGain.gain.setTargetAtTime(room, t, 0.08);
    for (let i = 0; i < this.noise.length; i++) {
      const pick = noise[i] || 0;
      const lvl = (this.noise[i].kind === 'hum' ? 0.55 : 0.75) * Math.pow(pick, 1.3);
      this.noise[i].out.gain.setTargetAtTime(lvl, t, 0.05);
    }
  }
}

function rms(analyser, arr) {
  analyser.getFloatTimeDomainData(arr);
  let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
  return Math.sqrt(s / arr.length);
}

// Small room impulse response: a few early reflections + a noise tail whose highs die first.
function makeRoomIR(ctx, seconds) {
  const rate = ctx.sampleRate, n = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, n, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, env = Math.exp(-6.8 * t), cut = 0.5 - 0.44 * t;
      lp += ((Math.random() * 2 - 1) - lp) * cut;
      d[i] = lp * env * 0.8;
    }
    for (const [ms, a] of [[8, 0.5], [13, 0.42], [19, 0.36], [27, 0.3], [36, 0.22], [48, 0.16]]) {
      const k = Math.floor(ms / 1000 * rate); if (k < n) d[k] += a * (c ? -0.8 : 1) * (0.75 + Math.random() * 0.25);
    }
  }
  return buf;
}
function noiseBuffer(ctx, seconds, kind) {
  const rate = ctx.sampleRate, n = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, n, rate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else { // pink (Paul Kellet)
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  }
  return buf;
}
function loopNoise(ctx, kind, seconds) { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, seconds, kind); s.loop = true; s.start(); return s; }

// Lighting power converter / ballast: 100 Hz mains hum (50 Hz × 2) with harmonics + a small fan.
function makeHum(ctx) {
  const out = ctx.createGain(); out.gain.value = 1;
  const real = new Float32Array(10), imag = new Float32Array(10);
  [0, 1, 0.55, 0.4, 0.3, 0.2, 0.14, 0.1, 0.07, 0.05].forEach((a, i) => { imag[i] = a; });
  const osc = ctx.createOscillator(); osc.setPeriodicWave(ctx.createPeriodicWave(real, imag)); osc.frequency.value = 100;
  const humG = ctx.createGain(); humG.gain.value = 0.5; osc.connect(humG).connect(out); osc.start();
  const fan = loopNoise(ctx, 'pink', 5); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
  const fanG = ctx.createGain(); fanG.gain.value = 0.45; fan.connect(bp).connect(fanG).connect(out);
  return out;
}
// Street outside the window: low traffic rumble swelling slowly, with a thin "whoosh" layer.
function makeTraffic(ctx) {
  const out = ctx.createGain(); out.gain.value = 1;
  const rumble = loopNoise(ctx, 'brown', 7); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
  const rg = ctx.createGain(); rg.gain.value = 0.7; rumble.connect(lp).connect(rg).connect(out);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lfoG = ctx.createGain(); lfoG.gain.value = 0.3; lfo.connect(lfoG).connect(rg.gain); lfo.start();
  const air = loopNoise(ctx, 'pink', 6); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.2;
  const ag = ctx.createGain(); ag.gain.value = 0.10; air.connect(bp).connect(ag).connect(out);
  const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.21; const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.08; lfo2.connect(lfo2G).connect(ag.gain); lfo2.start();
  return out;
}
