// Placeholder audio (near-silent noise bursts) so the take flow can be tested before TTS is ready.
import fs from 'node:fs/promises'; import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const script = JSON.parse(await fs.readFile(path.join(ROOT, 'content/script.json'), 'utf8'));
await fs.mkdir(path.join(ROOT, 'public/audio'), { recursive: true });
function wav(seconds, rate = 48000) {
  const n = Math.floor(seconds * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const env = Math.sin(i / rate * 6) ** 2; buf.writeInt16LE(Math.round((Math.random() * 2 - 1) * 3000 * env), 44 + i * 2); }
  return buf;
}
const out = { ...script, lines: [] };
let i = 0;
for (const line of script.lines) {
  const dur = Math.max(1.0, line.text.replace(/[。、…！？「」]/g, '').length * 0.17);
  const file = `line_${String(i).padStart(2, '0')}.wav`;
  await fs.writeFile(path.join(ROOT, 'public/audio', file), wav(dur));
  out.lines.push({ ...line, file: `audio/${file}`, duration: +dur.toFixed(3), styleUsed: 'placeholder' }); i++;
}
await fs.writeFile(path.join(ROOT, 'public/script.json'), JSON.stringify(out, null, 2));
console.log('placeholder script.json written; total ≈', out.lines.reduce((s, l) => s + l.duration + (l.gapAfter || 0), 0).toFixed(1), 's');
