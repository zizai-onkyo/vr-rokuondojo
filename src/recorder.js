// Records the game canvas (+ HUD + overlays) with the game audio into a WebM, then POSTs it to the dev server.
// Overlays (Nintendo-Direct-style): callout (big keyword plate, top), subtitle (narration text, bottom), lowerThird (presenter name plate),
// cards (full-frame title / logo / illustrated explanation), simulated-headset masks.
import { drawIllustration } from './illustrations.js';
const F = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", system-ui, sans-serif';
export class Recorder {
  constructor({ glCanvas, hudCanvas, width = 1920, height = 1080 }) {
    this.gl = glCanvas; this.hud = hudCanvas;
    this.canvas = document.createElement('canvas'); this.canvas.width = width; this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.caption = ''; this.captionSub = ''; this.showHud = true; this.pip = null; this.warn = ''; this.card = null; this.hmdMask = null;
    this.callout = null; this.subtitle = ''; this.lowerThird = null;
    this.logo = new Image(); this.logo.src = './img/logo_white.png';
    this.img = {};   // brush-calligraphy images (precepts etc.), by name
    for (let i = 1; i <= 6; i++) { this.loadImg('okite_w_' + i); this.loadImg('okite_d_' + i); }
    this.loadImg('okite_title_d'); this.loadImg('okite_title_w');
    this.rec = null; this.chunks = []; this.active = false; this.frames = 0;
  }
  loadImg(name) { const im = new Image(); im.src = './img/' + name + '.png'; this.img[name] = im; return im; }
  ready(name) { const im = this.img[name]; return im && im.complete && im.naturalWidth ? im : null; }
  // called once per rendered frame while recording (or before a screenshot)
  compose() {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    if (this.card) { if (this.card.board) this.drawBoard(c, W, H, this.card); else this.drawCard(c, W, H, this.card); this.frames++; return; }
    c.drawImage(this.gl, 0, 0, W, H);
    if (this.hmdMask) this.drawHmdMask(c, W, H);
    if (this.showHud && this.hud) { const s = 0.62; c.drawImage(this.hud, 24, 24, this.hud.width * s, this.hud.height * s); }
    if (this.pip && this.warn) {
      const { x, y, w, h } = this.pip;
      c.lineWidth = 6; c.strokeStyle = '#ff3b30'; c.strokeRect(x + 3, y + 3, w - 6, h - 6);
      c.font = `800 34px ${F}`; c.textAlign = 'center'; c.fillStyle = '#ff3b30'; c.shadowColor = '#000'; c.shadowBlur = 6;
      c.fillText(this.warn, x + w / 2, y + h - 22); c.shadowBlur = 0; c.textAlign = 'left';
    }
    if (this.callout) this.drawCallout(c, W, H, this.callout);
    if (this.lowerThird) this.drawLowerThird(c, W, H, this.lowerThird);
    if (this.subtitle) this.drawSubtitle(c, W, H, this.subtitle);
    if (this.caption) {
      c.font = `600 46px ${F}`; c.textAlign = 'center'; c.textBaseline = 'bottom';
      const tw = c.measureText(this.caption).width;
      c.fillStyle = 'rgba(0,0,0,0.62)'; c.beginPath(); c.roundRect(W / 2 - tw / 2 - 28, H - 150, tw + 56, 72, 14); c.fill();
      c.fillStyle = '#fff'; c.fillText(this.caption, W / 2, H - 92);
      if (this.captionSub) { c.font = '500 26px system-ui, sans-serif'; c.fillStyle = '#cfd8e3'; c.fillText(this.captionSub, W / 2, H - 50); }
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    }
    this.frames++;
  }
  // big keyword at the top: red brush bar + bold text on a dark plate
  drawCallout(c, W, H, co) {
    const text = co.text || '', sub = co.sub || '';
    const im = co.image ? this.ready(co.image) : null;
    const ih = 78, iw = im ? im.naturalWidth * ih / im.naturalHeight : 0;
    c.font = `800 50px ${F}`; const tw = im ? iw : c.measureText(text).width;
    c.font = `500 26px ${F}`; const sw = sub ? c.measureText(sub).width : 0;
    const pw = Math.max(tw, sw) + 120, ph = sub ? (im ? 150 : 128) : (im ? 112 : 92), x = W / 2 - pw / 2, y = this.showHud ? 36 : 44;
    c.fillStyle = 'rgba(8,10,14,0.80)'; c.beginPath(); c.roundRect(x, y, pw, ph, 18); c.fill();
    c.fillStyle = '#d33a2f'; c.beginPath(); c.roundRect(x + 26, y + 22, 12, ph - 44, 6); c.fill();
    c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = '#fff';
    if (im) c.drawImage(im, x + 60, y + 16, iw, ih);
    else { c.font = `800 50px ${F}`; c.fillText(text, x + 64, y + 20); }
    if (sub) { c.fillStyle = '#b9c6d4'; c.font = `500 26px ${F}`; c.fillText(sub, x + 66, y + (im ? 104 : 84)); }
    c.textBaseline = 'alphabetic';
  }
  // 心得 board: a paper panel with the title and the six precepts in sumi ink, a red seal bottom-right
  drawBoard(c, W, H, card) {
    c.fillStyle = '#0b0c10'; c.fillRect(0, 0, W, H);
    const bw = 1560, bh = 900, bx = (W - bw) / 2, by = (H - bh) / 2;
    c.fillStyle = '#3a2a1f'; c.beginPath(); c.roundRect(bx - 22, by - 22, bw + 44, bh + 44, 10); c.fill();           // wooden frame
    c.fillStyle = '#efe6d2'; c.fillRect(bx, by, bw, bh);                                                              // paper
    const g = c.createLinearGradient(bx, by, bx + bw, by + bh); g.addColorStop(0, 'rgba(120,90,50,0.10)'); g.addColorStop(1, 'rgba(120,90,50,0.0)');
    c.fillStyle = g; c.fillRect(bx, by, bw, bh);
    const title = this.ready('okite_title_d');
    if (title) { const th = 112, tw = title.naturalWidth * th / title.naturalHeight; c.drawImage(title, W / 2 - tw / 2, by + 44, tw, th); }
    c.fillStyle = '#9a2b22'; c.fillRect(bx + 120, by + 180, bw - 240, 3);
    const lh = 94, top = by + 215, lhImg = 66;
    for (let i = 1; i <= 6; i++) {
      const im = this.ready('okite_d_' + i); if (!im) continue;
      const iw = im.naturalWidth * lhImg / im.naturalHeight;
      c.drawImage(im, bx + 130, top + (i - 1) * lh, iw, lhImg);
    }
    // seal
    const sx = bx + bw - 190, sy = by + bh - 150;
    c.fillStyle = '#c23b2c'; c.beginPath(); c.roundRect(sx, sy, 110, 110, 8); c.fill();
    c.fillStyle = '#efe6d2'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 26px ${F}`; c.fillText('錄音', sx + 55, sy + 36); c.fillText('道場', sx + 55, sy + 74);
    c.fillStyle = '#3a2a1f'; c.font = `600 24px ${F}`; c.textAlign = 'right'; c.fillText(card.footer || '', sx - 30, sy + 92);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }
  // narration subtitle at the bottom (wraps to two lines)
  drawSubtitle(c, W, H, text) {
    c.font = `600 40px ${F}`;
    const lines = wrap(c, text, 1640).slice(0, 3);
    const lh = 54, pad = 20, ph = lines.length * lh + pad * 2;
    const pw = Math.max(...lines.map(l => c.measureText(l).width)) + 80;
    const y = H - 70 - ph;
    c.fillStyle = 'rgba(0,0,0,0.60)'; c.beginPath(); c.roundRect(W / 2 - pw / 2, y, pw, ph, 14); c.fill();
    c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = '#fff';
    lines.forEach((l, i) => c.fillText(l, W / 2, y + pad + i * lh + 4));
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }
  drawLowerThird(c, W, H, lt) {
    const x = 80, y = H - 372;
    c.font = `800 44px ${F}`; const nw = c.measureText(lt.name || '').width;
    c.font = `500 28px ${F}`; const tw = c.measureText(lt.title || '').width;
    const pw = Math.max(nw, tw) + 90;
    c.fillStyle = 'rgba(8,10,14,0.82)'; c.beginPath(); c.roundRect(x, y, pw, 118, 14); c.fill();
    c.fillStyle = '#d33a2f'; c.fillRect(x, y + 18, 10, 82);
    c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = '#fff'; c.font = `800 44px ${F}`; c.fillText(lt.name || '', x + 36, y + 16);
    c.fillStyle = '#b9c6d4'; c.font = `500 28px ${F}`; c.fillText(lt.title || '', x + 36, y + 72);
    c.textBaseline = 'alphabetic';
  }
  drawHmdMask(c, W, H) {
    if (this.hmdMask === 'stereo') {
      const hw = W / 2, r0 = Math.min(hw, H) * 0.40, r1 = Math.min(hw, H) * 0.66;
      for (const ox of [0, hw]) {
        const g = c.createRadialGradient(ox + hw / 2, H / 2, r0, ox + hw / 2, H / 2, r1);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
        c.fillStyle = g; c.fillRect(ox, 0, hw, H);
      }
      c.fillStyle = '#000'; c.fillRect(hw - 3, 0, 6, H);
      c.font = '600 22px system-ui, sans-serif'; c.fillStyle = 'rgba(255,255,255,0.7)'; c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText('L', 30, 24); c.fillText('R', hw + 30, 24);
    } else {
      const g = c.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, H * 0.98);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.8)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
  }
  drawCard(c, W, H, card) {
    c.fillStyle = card.bg || '#0b0c10'; c.fillRect(0, 0, W, H);
    if (card.logo) {   // brush logo centred, optional lines under it
      const lw = card.logoWidth || 1240, lh = lw * (this.logo.naturalHeight || 528) / (this.logo.naturalWidth || 2220);
      const ly = H * 0.40 - lh / 2;
      if (this.logo.complete && this.logo.naturalWidth) c.drawImage(this.logo, W / 2 - lw / 2, ly, lw, lh);
      c.textAlign = 'center'; c.textBaseline = 'top';
      let y = ly + lh + 40;
      if (card.kicker) { c.font = `600 30px ${F}`; c.fillStyle = '#9fb3c8'; c.fillText(card.kicker, W / 2, ly - 70); }
      c.font = `500 36px ${F}`; c.fillStyle = '#d6dee8';
      for (const l of card.lines || []) { c.fillText(l, W / 2, y); y += 54; }
      if (card.footer) { c.font = `500 24px ${F}`; c.fillStyle = '#7f8c9a'; c.fillText(card.footer, W / 2, H - 90); }
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      return;
    }
    if (card.illustration) {
      const x0 = 90, colW = W * 0.42;
      c.textAlign = 'left'; c.textBaseline = 'top';
      let y = 110;
      if (card.kicker) { c.font = `600 28px ${F}`; c.fillStyle = '#9fb3c8'; c.fillText(card.kicker, x0, y); y += 52; }
      const ts = card.titleSize || 60;
      c.font = `800 ${ts}px ${F}`; c.fillStyle = '#fff';
      for (const l of wrap(c, card.title || '', colW)) { c.fillText(l, x0, y); y += ts * 1.18; }
      y += 26;
      c.font = `500 30px ${F}`; c.fillStyle = '#d6dee8';
      for (const l of card.lines || []) for (const w of wrap(c, l, colW)) { c.fillText(w, x0, y); y += 46; }
      drawIllustration(c, card.illustration, W * 0.52, 90, W * 0.44, H - 180);
      if (card.footer) { c.font = `500 24px ${F}`; c.fillStyle = '#7f8c9a'; c.fillText(card.footer, x0, H - 80); }
      c.textBaseline = 'alphabetic';
      return;
    }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    let y = H / 2 - ((card.lines || []).length * 46) / 2 - 40;
    if (card.kicker) { c.font = `600 30px ${F}`; c.fillStyle = '#9fb3c8'; c.fillText(card.kicker, W / 2, y - 70); }
    c.font = `800 ${card.titleSize || 84}px ${F}`; c.fillStyle = '#fff'; c.fillText(card.title || '', W / 2, y);
    y += 70;
    c.font = `500 34px ${F}`; c.fillStyle = '#d6dee8';
    for (const l of card.lines || []) { y += 46; c.fillText(l, W / 2, y); }
    if (card.footer) { c.font = `500 24px ${F}`; c.fillStyle = '#7f8c9a'; c.fillText(card.footer, W / 2, H - 70); }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }
  start(name, audioStream, { fps = 60, bps = 14e6, abps = 192e3 } = {}) {
    if (this.active) return;
    const stream = this.canvas.captureStream(fps);
    if (audioStream) for (const t of audioStream.getAudioTracks()) stream.addTrack(t);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: abps });
    this.chunks = []; this.name = name; this.frames = 0;
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(1000); this.active = true; this.startedAt = performance.now();
    return mime;
  }
  stop() {
    return new Promise(resolve => {
      if (!this.active) return resolve(null);
      this.rec.onstop = async () => {
        const blob = new Blob(this.chunks, { type: this.rec.mimeType });
        const r = await fetch(`/__save?name=${encodeURIComponent(this.name + '.webm')}`, { method: 'POST', body: blob });
        const info = await r.json().catch(() => ({}));
        this.active = false;
        resolve({ ...info, bytes: blob.size, seconds: (performance.now() - this.startedAt) / 1000, frames: this.frames });
      };
      this.rec.stop();
    });
  }
  async screenshot(name) {
    this.compose();
    const blob = await new Promise(res => this.canvas.toBlob(res, 'image/png'));
    const r = await fetch(`/__save?name=${encodeURIComponent(name + '.png')}`, { method: 'POST', body: blob });
    return r.json();
  }
}

function wrap(c, text, maxW) {
  const out = []; let line = '';
  for (const ch of text) { if (line && c.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; }
  if (line) out.push(line); return out.length ? out : [''];
}
