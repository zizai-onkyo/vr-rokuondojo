#!/usr/bin/env node
// Deliverables of a split-audio take (recorded with: node scripts/record_headless.mjs record <name> --split):
//   <out>_LR.mov           H.264 1080p60 + 24-bit PCM stereo — L = narration, R = the gun mic (lossless stems, aligned to the picture)
//   <out>_LR.mp4           the same picture with AAC 320k (easy to share)
//   <out>_mix.mp4          a reference mix (narration + game, game ducked under the voice), peak -1 dBFS — for previews / a fallback upload
//   <out>_stems/*.wav      narration / gunmic / room as mono 32-bit float WAVs (untrimmed), same length as the picture
// The stems WAV (48 kHz float, ch1 narration / ch2 mic / ch3 room) is captured by an AudioWorklet in the page, so it starts a few
// milliseconds off the WebM's audio; the offset is measured by cross-correlating the narration (WebM L vs stem ch1) and corrected.
// Usage: node scripts/make_split_video.mjs recordings/award_take_v8.webm docs/deliverables/VR_Rokuondojo_award_video_v8
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [, , webm, outBase] = process.argv;
if (!webm || !outBase) { console.error('usage: make_split_video.mjs <take.webm> <out base>'); process.exit(1); }
const stems = webm.replace(/\.webm$/, '_stems.wav');
if (!fs.existsSync(stems)) { console.error('missing stems:', stems); process.exit(1); }
const RATE = 48000, SEC = 40;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
const runBin = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
const f32 = (file, chan) => { const b = runBin('ffmpeg', ['-v', 'error', '-i', file, '-t', String(SEC), '-af', `pan=mono|c0=c${chan}`, '-f', 'f32le', '-ar', String(RATE), '-ac', '1', 'pipe:1']); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4))); };
function vol(file, filter) {   // → { max, mean } in dBFS, measured in float (volumedetect would convert to 16-bit and clip at 0)
  const txt = execFileSync('bash', ['-c', `ffmpeg -hide_banner -i "${file}" -af "${filter},astats=measure_perchannel=none:measure_overall=Peak_level+RMS_level" -f null - 2>&1 | grep -E "Peak level dB|RMS level dB"`], { encoding: 'utf8' });
  const max = +(txt.match(/Peak level dB: (-?[\d.]+)/) || [])[1], mean = +(txt.match(/RMS level dB: (-?[\d.]+)/) || [])[1];
  return { max, mean };
}

// ── 1. picture: encode once (the WebM has no duration header; the MP4 tells us the exact length)
const dir = path.dirname(outBase); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(outBase + '_stems', { recursive: true });
const video = webm.replace(/\.webm$/, '_video.mp4');
if (!fs.existsSync(video)) {
  console.log('encoding picture →', video);
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', webm, '-an', '-vf', 'fps=60,scale=1920:1080:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-level', '4.2', '-movflags', '+faststart', video]);
}
const D = +JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', video])).format.duration;

// ── 2. offset between the stems and the WebM audio: cross-correlate the narration (first 40 s)
const v = f32(webm, 0), s = f32(stems, 0);
const decim = (x, f) => { const n = Math.floor(x.length / f), y = new Float32Array(n); for (let i = 0; i < n; i++) { let a = 0; for (let j = 0; j < f; j++) a += x[i * f + j]; y[i] = a / f; } return y; };
function bestLag(v, s, n0, n1, kmin, kmax) {   // corr(k) = Σ v[n+k]·s[n]  → k > 0: the stems start later than the picture
  let best = -Infinity, bk = 0;
  for (let k = kmin; k <= kmax; k++) { let c = 0; const a = Math.max(n0, -k), b = Math.min(n1, v.length - 1 - k, s.length - 1); for (let n = a; n <= b; n++) c += v[n + k] * s[n]; if (c > best) { best = c; bk = k; } }
  return { k: bk, c: best };
}
const F = 16, win1 = Math.min(38, Math.floor(Math.min(v.length, s.length) / RATE) - 1);
const coarse = bestLag(decim(v, F), decim(s, F), Math.floor(2 * RATE / F), Math.floor(win1 * RATE / F), -Math.floor(RATE / F), Math.floor(RATE / F));   // ±1 s
const fine = bestLag(v, s, 2 * RATE, win1 * RATE, coarse.k * F - 2 * F, coarse.k * F + 2 * F);
const k = fine.k;
let ev = 0, es = 0; { const a = Math.max(2 * RATE, -k), b = Math.min(win1 * RATE, v.length - 1 - k, s.length - 1); for (let n = a; n <= b; n++) { ev += v[n + k] ** 2; es += s[n] ** 2; } }
const rho = fine.c / Math.sqrt(ev * es);   // normalised correlation at the best lag (1 = identical signals)
console.log(JSON.stringify({ duration: D, lagSamples: k, lagMs: +(k / RATE * 1000).toFixed(2), rho: +rho.toFixed(3) }));
if (!(rho > 0.5)) { console.error('alignment looks unreliable (rho ≤ 0.5) — stopping'); process.exit(2); }
const align = (k > 0 ? `adelay=delays=${k}S:all=1,` : k < 0 ? `atrim=start_sample=${-k},asetpts=PTS-STARTPTS,` : '') + `apad,atrim=0:${D}`;

// ── 3. levels: the stems stay untrimmed (32-bit float); the 24-bit L/R file gets one common trim so its louder channel peaks at -1 dBFS
const peaks = [0, 1, 2].map(c => vol(stems, `pan=mono|c0=c${c}`));
const trim = +Math.min(0, -1 - Math.max(peaks[0].max, peaks[1].max)).toFixed(2);
console.log(JSON.stringify({ peaks: { narration: peaks[0], gunmic: peaks[1], room: peaks[2] }, trimLRdB: trim }));
const raw = `[1:a]${align}`, pre = `${raw},volume=${trim}dB`;

// ── 4. outputs
const mov = `${outBase}_LR.mov`, mp4 = `${outBase}_LR.mp4`, mix = `${outBase}_mix.mp4`;
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-i', stems, '-filter_complex', `${pre},pan=stereo|c0=c0|c1=c1[lr]`, '-map', '0:v', '-map', '[lr]', '-c:v', 'copy', '-c:a', 'pcm_s24le', '-ar', '48000', mov]);
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', mov, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', mp4]);
for (const [c, nm] of [[0, 'narration'], [1, 'gunmic'], [2, 'room']])
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-i', stems, '-filter_complex', `${raw},pan=mono|c0=c${c}[m]`, '-map', '[m]', '-c:a', 'pcm_f32le', `${outBase}_stems/${nm}.wav`]);
// reference mix: narration + (mic + room) ducked under the narration by a sidechain compressor (~ -12 dB, like the game), limited, then peak -1 dBFS
const mixF = `${raw},asplit=2[x][y];[x]pan=mono|c0=c0[nar];[y]pan=mono|c0=c1+c2[game];[nar]asplit=2[n1][n2];[game][n2]sidechaincompress=threshold=0.1:ratio=4:attack=40:release=400:knee=2[gd];[n1][gd]amix=inputs=2:normalize=0,alimiter=limit=0.89:level=0:attack=5:release=100[m0]`;   // a limiter like the game's catches the slate clap
const tmpMix = `${outBase}_mix_tmp.wav`;
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-i', stems, '-filter_complex', mixF, '-map', '[m0]', '-c:a', 'pcm_f32le', tmpMix]);
const mixPeak = vol(tmpMix, 'anull');
const mixGain = +(-1 - mixPeak.max).toFixed(2);
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-i', tmpMix, '-filter_complex', `[1:a]volume=${mixGain}dB,pan=stereo|c0=c0|c1=c0[mix]`, '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mix]);
fs.unlinkSync(tmpMix);
const sizes = Object.fromEntries([mov, mp4, mix, ...['narration', 'gunmic', 'room'].map(n => `${outBase}_stems/${n}.wav`)].map(f => [path.basename(f), +(fs.statSync(f).size / 1048576).toFixed(1) + ' MiB']));
console.log(JSON.stringify({ mixPeakBefore: mixPeak.max, mixGainDb: mixGain, outputs: sizes }));
