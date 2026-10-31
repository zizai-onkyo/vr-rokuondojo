// Generate WAVs with a running AivisSpeech Engine (VOICEVOX-compatible API).
// Usage: node scripts/gen_voice.mjs [--in content/script.json] [--out public/script.json] [--prefix line_] [--host http://127.0.0.1:10101]
//   content/script.json    → public/script.json    + public/audio/line_XX.wav       (stage 1)
//   content/script_s2.json → public/script_s2.json + public/audio/s2_XX.wav         (stage 2)
//   content/director.json  → public/director.json  + public/audio/dir_<id>.wav      (director / slate calls)
import fs from 'node:fs/promises';
import path from 'node:path';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const HOST = arg('--host', 'http://127.0.0.1:10101');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SRC = path.resolve(ROOT, arg('--in', 'content/script.json'));
const OUT_JSON = path.resolve(ROOT, arg('--out', 'public/script.json'));
const PREFIX = arg('--prefix', 'line_');
const OUT_DIR = path.join(ROOT, 'public', 'audio');

const ONLY = arg('--only', null) ? new Set(arg('--only', '').split(',')) : null;   // regenerate only these line ids; keep the rest from the existing output
const script = JSON.parse(await fs.readFile(SRC, 'utf8'));
await fs.mkdir(OUT_DIR, { recursive: true });
let prev = null;
if (ONLY) { try { prev = JSON.parse(await fs.readFile(OUT_JSON, 'utf8')); } catch { prev = null; } }

const speakers = await (await fetch(`${HOST}/speakers`)).json();
function styleId(speakerName, styleName) {
  const sp = speakers.find(s => s.name.includes(speakerName)) || speakers.find(s => speakerName.includes(s.name));
  if (!sp) throw new Error(`speaker not found: ${speakerName}. available: ${speakers.map(s => s.name).join(', ')}`);
  const st = sp.styles.find(s => s.name === styleName) || sp.styles.find(s => s.name.includes(styleName)) || sp.styles[0];
  return { id: st.id, name: st.name, speaker: sp.name };
}

function wavDuration(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const channels = view.getUint16(22, true), rate = view.getUint32(24, true), bits = view.getUint16(34, true);
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4), size = view.getUint32(off + 4, true);
    if (id === 'data') return size / (rate * channels * (bits / 8));
    off += 8 + size + (size % 2);
  }
  return 0;
}

const LEVEL_VOLUME = { whisper: 0.5, normal: 0.82, loud: 1.0 };
const LEVEL_SPEED = { whisper: 0.92, normal: 1.0, loud: 1.06 };
const out = { ...script, lines: [] };
let i = 0;
for (const line of script.lines) {
  if (ONLY && !ONLY.has(line.id ?? String(i))) {
    const keep = prev && prev.lines.find(l => (l.id ?? '') === (line.id ?? '') && l.text === line.text);
    if (keep) { out.lines.push({ ...line, file: keep.file, duration: keep.duration, styleUsed: keep.styleUsed }); console.log(`${keep.file}  (kept)`); i++; continue; }
  }
  const actor = script.actors.find(a => a.id === line.actor) || script.actors[0];
  const style = styleId(actor.voice.speaker, (actor.voice.styles || {})[line.style] || actor.voice.style || 'ノーマル');
  const q = await (await fetch(`${HOST}/audio_query?${new URLSearchParams({ text: line.text, speaker: style.id })}`, { method: 'POST' })).json();
  q.speedScale = actor.voice.speed * (LEVEL_SPEED[line.level] ?? 1);
  q.pitchScale = actor.voice.pitch;
  q.intonationScale = actor.voice.intonation * (line.level === 'whisper' ? 0.8 : line.level === 'loud' ? 1.15 : 1);
  q.volumeScale = LEVEL_VOLUME[line.level] ?? 1;
  q.prePhonemeLength = 0.08; q.postPhonemeLength = 0.15;
  q.outputSamplingRate = 48000; q.outputStereo = false;
  const res = await fetch(`${HOST}/synthesis?${new URLSearchParams({ speaker: style.id })}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q),
  });
  if (!res.ok) throw new Error(`synthesis failed (${res.status}) for line ${i}: ${await res.text()}`);
  const wav = Buffer.from(await res.arrayBuffer());
  const file = `${PREFIX}${line.id ?? String(i).padStart(2, '0')}.wav`;
  await fs.writeFile(path.join(OUT_DIR, file), wav);
  const dur = wavDuration(wav);
  out.lines.push({ ...line, file: `audio/${file}`, duration: +dur.toFixed(3), styleUsed: style.name });
  console.log(`${file}  ${actor.name} [${style.name}] ${dur.toFixed(2)}s  ${line.text}`);
  i++;
}
await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2));
const total = out.lines.reduce((s, l) => s + l.duration + (l.gapAfter || 0), 0);
console.log(`wrote ${OUT_JSON}; total length ≈ ${total.toFixed(1)}s`);
