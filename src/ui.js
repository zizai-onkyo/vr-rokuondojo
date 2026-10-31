// 2D-canvas UI, used both as a DOM overlay (desktop) and as textures on in-world panels (VR).
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif';

export class Hud {
  constructor(w = 880, h = 520) {
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.flash = 0;
  }
  draw(s) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    this.flash = (this.flash + 1) % 60;
    const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    c.fillStyle = 'rgba(8,10,14,0.78)'; rr(0, 0, W, H, 22); c.fill();
    c.font = `600 26px ${FONT}`; c.fillStyle = '#9fb3c8'; c.textBaseline = 'top';
    const head = s.phase === 'take' ? '● ROLLING' : s.phase === 'results' ? 'CUT — RESULTS' : s.phase === 'cutting' ? 'CUT' : s.phase === 'standby' ? 'STAND BY' : 'VR録音道場';
    c.fillText(head, 28, 22);
    if (s.stageTag) { c.font = `500 20px ${FONT}`; c.fillStyle = '#6f7d8c'; c.fillText(s.stageTag, 28 + c.measureText(head).width * 1.3 + 40, 27); c.font = `600 26px ${FONT}`; }
    if (s.phase === 'take') { c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(W - 48, 36, 10 + (this.flash < 30 ? 2 : 0), 0, Math.PI * 2); c.fill(); }
    if (s.phase === 'take') { c.font = `500 22px ${FONT}`; c.fillStyle = '#8a98a8'; c.textAlign = 'right'; c.fillText(fmtTime(s.timeLeft), W - 70, 26); c.textAlign = 'left'; }

    if (s.phase === 'results' && s.results) return this.drawResults(s.results);

    // score
    c.font = `700 84px ${FONT}`; c.fillStyle = '#ffffff'; c.fillText(String(Math.round(s.score)).padStart(5, ' '), 24, 56);
    c.font = `600 30px ${FONT}`; c.fillStyle = s.rate >= 60 ? '#4cd964' : s.rate > 0 ? '#c8d6a0' : s.rate < 0 ? '#ff3b30' : '#777';
    c.fillText(`${s.rate >= 0 ? '+' : ''}${Math.round(s.rate)} /s`, 290, 92);

    // speaker + line
    c.font = `600 26px ${FONT}`; c.fillStyle = '#e8eef5';
    c.fillText(s.speakerName ? `${s.speakerName}  ${levelTag(s.level)}` : '（間）', 28, 160);
    c.font = `500 28px ${FONT}`; c.fillStyle = '#ffffff';
    wrapText(c, s.lineText || '', 28, 198, W - 56, 36, 2);

    // meters
    meter(c, 28, 292, W - 56, '軸ズレ角', `${s.angleDeg.toFixed(1)}°`, s.dirScore, '#58c6ff');
    meter(c, 28, 350, W - 56, '口との距離', `${s.dist.toFixed(2)} m`, s.distScore, '#ffd166');

    // warnings
    const y = 420;
    let bx = badge(c, 28, y, s.inFrame ? '⚠ BOOM IN FRAME' : 'FRAME OK', s.inFrame ? '#ff3b30' : '#2d7a44', this.flash);
    bx = badge(c, bx + 14, y, s.shadowInFrame ? '✖ SHADOW NG' : 'SHADOW OK', s.shadowInFrame ? '#ff3b30' : '#2d7a44', this.flash);
    bx = badge(c, bx + 14, y, s.noiseBad ? `⚠ NOISE ${s.noiseName || ''}` : 'NOISE OK', s.noiseBad ? '#ff9500' : '#2d7a44', this.flash);
    if (s.contact) badge(c, bx + 14, y, '接触!', '#ff9500', this.flash);
    c.font = `500 20px ${FONT}`; c.fillStyle = '#7f8c9a';
    c.fillText(s.footer || '', 28, H - 34);
  }
  drawResults(r) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.font = `800 150px ${FONT}`; c.fillStyle = { S: '#ffd166', A: '#4cd964', B: '#58c6ff', C: '#ff9f80' }[r.rank] || '#fff';
    c.fillText(r.rank, 36, 60);
    c.font = `700 44px ${FONT}`; c.fillStyle = '#fff'; c.fillText(`${r.score} / ${r.max}`, 200, 86);
    c.font = `500 24px ${FONT}`; c.fillStyle = '#b8c4d0'; c.fillText(`収録効率 ${(r.ratio * 100).toFixed(0)}%   画角 ${r.frameSec.toFixed(1)}s   影 ${r.shadowSec.toFixed(1)}s   雑音 ${(r.noiseSec || 0).toFixed(1)}s`, 200, 140);
    c.font = `500 21px ${FONT}`;
    let y = 220;
    for (const l of r.lines.slice(0, 7)) {
      c.fillStyle = l.eff >= 0.8 ? '#4cd964' : l.eff >= 0.5 ? '#ffd166' : '#ff6b5e';
      c.fillRect(28, y + 4, 14, 14);
      c.fillStyle = '#e8eef5';
      c.fillText(`${l.actor}  ${(l.eff * 100).toFixed(0).padStart(3)}%  軸${l.avgAngle.toFixed(0).padStart(3)}°  ${l.avgDist.toFixed(2)}m  ${l.text.slice(0, 18)}`, 52, y);
      y += 32;
    }
    c.font = `500 20px ${FONT}`; c.fillStyle = '#7f8c9a'; c.fillText('Space / A ボタン: もう一度   N / Y ボタン: ステージ切替', 28, H - 34);
  }
}

// Red frame + warning text drawn over the on-set monitor
export class MonitorOverlay {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.flash = 0; }
  draw({ inFrame, shadowInFrame, label = 'CAM A  50mm', rec = true }) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H); this.flash = (this.flash + 1) % 40;
    const bad = inFrame || shadowInFrame;
    c.lineWidth = bad ? 10 : 4; c.strokeStyle = bad ? (this.flash < 20 ? '#ff3b30' : '#ff8a80') : 'rgba(255,255,255,0.85)';
    c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, W - c.lineWidth, H - c.lineWidth);
    c.font = `600 16px ${FONT}`; c.fillStyle = '#fff'; c.textBaseline = 'top'; c.shadowColor = '#000'; c.shadowBlur = 4;
    c.fillText(label, 14, 10);
    if (rec) { c.fillStyle = '#ff3b30'; c.fillText('● REC', W - 70, 10); }
    if (bad) { c.font = `800 30px ${FONT}`; c.textAlign = 'center'; c.fillStyle = '#ff3b30'; c.fillText(shadowInFrame ? 'SHADOW NG' : 'BOOM IN FRAME', W / 2, H - 46); c.textAlign = 'left'; }
    c.shadowBlur = 0;
  }
}

function fmtTime(t) { t = Math.max(0, t); return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; }
function levelTag(l) { return l === 'whisper' ? '〔小声〕' : l === 'loud' ? '〔大声〕' : ''; }
function meter(c, x, y, w, label, val, v, color) {
  c.font = `500 20px ${FONT}`; c.fillStyle = '#9fb3c8'; c.textBaseline = 'top'; c.fillText(label, x, y);
  c.textAlign = 'right'; c.fillStyle = '#fff'; c.fillText(val, x + w, y); c.textAlign = 'left';
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.roundRect(x, y + 28, w, 14, 7); c.fill();
  c.fillStyle = color; c.beginPath(); c.roundRect(x, y + 28, Math.max(10, w * v), 14, 7); c.fill();
}
function badge(c, x, y, text, color, flash) {
  c.font = `700 22px ${FONT}`; const w = c.measureText(text).width + 30;
  c.fillStyle = color; c.globalAlpha = ((color === '#ff3b30' || color === '#ff9500') && flash < 30) ? 1 : 0.85;
  c.beginPath(); c.roundRect(x, y, w, 40, 10); c.fill(); c.globalAlpha = 1;
  c.fillStyle = '#fff'; c.textBaseline = 'top'; c.fillText(text, x + 15, y + 8);
  return x + w;
}
function wrapText(c, text, x, y, maxW, lh, maxLines) {
  let line = '', lines = [];
  for (const ch of text) { if (c.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch; }
  lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => c.fillText(l, x, y + i * lh));
}
