// Simple line-art illustrations for the explanation cards (Canvas 2D).
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", system-ui, sans-serif';
const C = { ink: '#e8eef5', dim: '#8a98a8', yellow: '#ffd400', red: '#ff3b30', green: '#4cd964', blue: '#58c6ff', skin: '#f1c9a5', hair: '#3b2a22', body: '#4e7bd3', mic: '#2b2b2b', fur: '#6b6b6b' };

export function drawIllustration(ctx, kind, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  // panel
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; rr(ctx, 0, 0, w, h, 24); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; rr(ctx, 0, 0, w, h, 24); ctx.stroke();
  if (kind === 'scoring') drawScoring(ctx, w, h);
  else if (kind === 'frameShadow') drawFrameShadow(ctx, w, h);
  else if (kind === 'vrModes') drawVRModes(ctx, w, h);
  else if (kind === 'noise') drawNoise(ctx, w, h);
  ctx.restore();
}

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function label(c, text, x, y, { size = 24, color = C.ink, align = 'left', weight = 600 } = {}) {
  c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(text, x, y); c.textAlign = 'left';
}
function line(c, x1, y1, x2, y2, color, width = 3, dash = null) {
  c.save(); c.strokeStyle = color; c.lineWidth = width; if (dash) c.setLineDash(dash);
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
}
function head(c, x, y, r, { mouthOpen = true } = {}) {
  c.fillStyle = C.skin; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = C.hair; c.beginPath(); c.arc(x, y - r * 0.08, r * 1.02, Math.PI * 1.05, Math.PI * 1.95); c.fill();
  c.fillStyle = '#151515'; c.beginPath(); c.arc(x + r * 0.35, y - r * 0.1, r * 0.08, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#5a1e1e'; c.beginPath(); c.ellipse(x + r * 0.62, y + r * 0.35, r * 0.16, mouthOpen ? r * 0.2 : r * 0.05, 0, 0, Math.PI * 2); c.fill();
  return { mouth: [x + r * 0.62, y + r * 0.35] };
}
function body(c, x, y, w, h, color) { c.fillStyle = color; rr(c, x - w / 2, y, w, h, w / 2); c.fill(); }
function mic(c, x, y, angle, len = 150, wdt = 44) {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.fillStyle = C.fur; rr(c, -len, -wdt / 2, len, wdt, wdt / 2); c.fill();
  c.fillStyle = C.mic; rr(c, -len * 0.42, -wdt * 0.36, len * 0.42, wdt * 0.72, wdt * 0.36); c.fill();
  c.restore();
}
function pole(c, x1, y1, x2, y2) { line(c, x1, y1, x2, y2, '#1b1b1b', 9); line(c, x1, y1, x2, y2, '#555', 3); }
function cameraIcon(c, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.fillStyle = '#1e1e1e'; rr(c, -40, -26, 80, 52, 8); c.fill();
  c.fillStyle = '#2a2a2a'; rr(c, 40, -16, 34, 32, 6); c.fill();
  c.fillStyle = '#ff2020'; c.beginPath(); c.arc(-26, -14, 5, 0, Math.PI * 2); c.fill();
  line(c, -18, 26, -34, 70, '#1e1e1e', 5); line(c, 18, 26, 34, 70, '#1e1e1e', 5);
  c.restore();
}
function lampIcon(c, x, y, angle) {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.fillStyle = '#1a1a1a'; c.beginPath(); c.moveTo(-26, -30); c.lineTo(26, -30); c.lineTo(36, 30); c.lineTo(-36, 30); c.closePath(); c.fill();
  c.fillStyle = '#ffe9c8'; c.fillRect(-32, 26, 64, 8);
  c.restore();
}
function controllerIcon(c, x, y, angle, s = 1) {
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(s, s);
  c.fillStyle = '#e9e9e9'; rr(c, -14, -8, 28, 70, 12); c.fill();          // grip
  c.strokeStyle = '#e9e9e9'; c.lineWidth = 7; c.beginPath(); c.ellipse(0, -24, 34, 20, 0, 0, Math.PI * 2); c.stroke();  // tracking ring
  c.fillStyle = '#333'; c.beginPath(); c.arc(-4, 6, 5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(8, 14, 4, 0, Math.PI * 2); c.fill();
  c.restore();
}
function badge(c, text, x, y, color) {
  c.font = `800 26px ${FONT}`; const w = c.measureText(text).width + 28;
  c.fillStyle = color; rr(c, x, y - 20, w, 40, 10); c.fill();
  c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(text, x + 14, y);
}

// ① aim at the mouth: directivity angle θ and distance d
function drawScoring(c, w, h) {
  const hx = w * 0.30, hy = h * 0.58, r = h * 0.11;
  body(c, hx, hy + r * 0.8, r * 1.9, h * 0.20, '#c9533b');
  const { mouth } = head(c, hx, hy, r);
  const [mx, my] = mouth;
  const tipX = w * 0.74, tipY = h * 0.20;
  const ang = Math.atan2(my - tipY, mx - tipX);                 // line to the mouth
  const axisAng = ang - 0.26;                                   // mic axis, slightly off the mouth
  c.save(); c.translate(tipX, tipY); c.rotate(axisAng);
  const g = c.createLinearGradient(0, 0, h * 0.62, 0); g.addColorStop(0, 'rgba(88,198,255,0.45)'); g.addColorStop(1, 'rgba(88,198,255,0.0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(h * 0.62, -h * 0.24); c.quadraticCurveTo(h * 0.72, 0, h * 0.62, h * 0.24); c.closePath(); c.fill();
  c.restore();
  line(c, tipX, tipY, tipX + Math.cos(axisAng) * h * 0.70, tipY + Math.sin(axisAng) * h * 0.70, C.blue, 3, [10, 8]);
  line(c, tipX, tipY, mx, my, C.yellow, 3);
  c.save(); c.strokeStyle = C.yellow; c.lineWidth = 3; c.beginPath(); c.arc(tipX, tipY, h * 0.22, Math.min(ang, axisAng), Math.max(ang, axisAng)); c.stroke(); c.restore();
  pole(c, w * 0.98, h * 0.03, tipX + Math.cos(ang + Math.PI) * 10, tipY + Math.sin(ang + Math.PI) * 10);
  mic(c, tipX, tipY, axisAng + Math.PI, h * 0.22, h * 0.065);
  // labels drawn last so nothing covers them
  const bis = (ang + axisAng) / 2;
  label(c, 'θ', tipX + Math.cos(bis) * h * 0.36, tipY + Math.sin(bis) * h * 0.36, { size: 34, color: C.yellow, weight: 800 });
  { const lx = mx - tipX, ly = my - tipY, L = Math.hypot(lx, ly), px = -ly / L, py = lx / L;   // perpendicular, away from the lobe
    label(c, 'd', tipX + lx * 0.55 - px * 40, tipY + ly * 0.55 - py * 40, { size: 34, color: C.yellow, weight: 800 }); }
  c.fillStyle = 'rgba(0,0,0,0.45)'; rr(c, w * 0.04, h * 0.80, w * 0.92, h * 0.16, 14); c.fill();
  label(c, 'θ：マイクの軸と口のズレ角 → 小さいほど高得点', w * 0.07, h * 0.855, { size: 24 });
  label(c, 'd：マイクと口の距離 → 近いほど高得点', w * 0.07, h * 0.925, { size: 24 });
  label(c, '小声は近く／大声なら離れてもOK', w * 0.60, h * 0.72, { size: 22, color: C.dim });
}

// ② stay out of frame / keep the shadow out of frame (side view)
function drawFrameShadow(c, w, h) {
  const floorY = h * 0.84, wallX = w * 0.92;
  line(c, w * 0.02, floorY, wallX, floorY, '#6b5b4a', 6);
  line(c, wallX, h * 0.06, wallX, floorY, '#8a949a', 6);
  // camera + frustum
  const lx = w * 0.12, ly = h * 0.60;
  cameraIcon(c, lx - 40, ly, 0.9);
  const topHit = [wallX, h * 0.22], botHit = [w * 0.78, floorY];
  c.save(); c.fillStyle = 'rgba(255,212,0,0.10)'; c.beginPath(); c.moveTo(lx, ly); c.lineTo(topHit[0], topHit[1]); c.lineTo(wallX, floorY); c.lineTo(botHit[0], botHit[1]); c.closePath(); c.fill(); c.restore();
  line(c, lx, ly, topHit[0], topHit[1], C.yellow, 3, [12, 8]);
  line(c, lx, ly, botHit[0], botHit[1], C.yellow, 3, [12, 8]);
  label(c, '画角', w * 0.50, h * 0.72, { size: 24, color: C.yellow });
  // actor
  const ax = w * 0.56, ay = h * 0.50, ar = h * 0.085;
  body(c, ax, ay + ar * 0.8, ar * 1.9, floorY - (ay + ar * 0.8), '#4e7bd3');
  head(c, ax, ay, ar);
  // key light, top-left
  const kx = w * 0.22, ky = h * 0.10;
  lampIcon(c, kx, ky, 0.9);
  // boom from the top-right; mic just above the frame line
  const tipX = w * 0.60, tipY = h * 0.28;
  pole(c, w * 0.99, h * 0.06, tipX, tipY);
  mic(c, tipX + 8, tipY + 8, Math.PI * 0.62, h * 0.17, h * 0.05);
  badge(c, 'OK', tipX + 30, tipY - 40, '#2d7a44');
  // ghost mic dipped into the frame
  c.save(); c.globalAlpha = 0.45; mic(c, tipX + 8, tipY + h * 0.16, Math.PI * 0.62, h * 0.17, h * 0.05); c.restore();
  badge(c, '✖ 画角に入った', tipX + 30, tipY + h * 0.17, C.red);
  // shadow ray from the light through the mic to the wall
  const dx = tipX - kx, dy = tipY - ky; const t = (wallX - kx) / dx; const sx = wallX, sy = ky + dy * t;
  line(c, kx + 30, ky + 30, tipX, tipY, 'rgba(255,233,200,0.8)', 2, [6, 6]);
  line(c, tipX, tipY, sx, sy, 'rgba(0,0,0,0.9)', 3, [6, 6]);
  c.fillStyle = 'rgba(0,0,0,0.85)'; rr(c, wallX - 10, sy - 60, 10, 120, 4); c.fill();
  badge(c, '✖ 影がフレームに', wallX - 330, sy + 120, C.red);
  label(c, 'ライトが作るブームの影が、フレームの中に落ちたらNG', w * 0.05, h * 0.93, { size: 22, color: C.dim });
}

// ③ VR controls: two-hand mode / real-pole mode
function drawVRModes(c, w, h) {
  // headset icon
  c.save(); c.translate(w * 0.5, h * 0.14);
  c.fillStyle = '#e9e9e9'; rr(c, -70, -26, 140, 52, 18); c.fill();
  c.fillStyle = '#222'; c.beginPath(); c.arc(-30, 0, 15, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(30, 0, 15, 0, Math.PI * 2); c.fill();
  c.restore();
  label(c, 'WebXR（Meta Quest 対応）', w * 0.5, h * 0.26, { size: 22, color: C.dim, align: 'center' });
  // left: two-hand mode
  const lx0 = w * 0.08, ly0 = h * 0.78, lx1 = w * 0.44, ly1 = h * 0.40;
  pole(c, lx0, ly0, lx1, ly1);
  mic(c, lx1, ly1, Math.atan2(ly1 - ly0, lx1 - lx0) + Math.PI * 0.62, h * 0.13, h * 0.045);
  const a = Math.atan2(ly1 - ly0, lx1 - lx0) + Math.PI / 2;
  controllerIcon(c, lx0 + (lx1 - lx0) * 0.12, ly0 + (ly1 - ly0) * 0.12, a, 0.8);
  controllerIcon(c, lx0 + (lx1 - lx0) * 0.55, ly0 + (ly1 - ly0) * 0.55, a, 0.8);
  label(c, '両手モード', w * 0.25, h * 0.90, { size: 26, align: 'center' });
  label(c, '左手＝後端、右手＝前方。手首の捻りで首振り', w * 0.25, h * 0.96, { size: 17, color: C.dim, align: 'center' });
  // right: pole mode
  const rx0 = w * 0.56, ry0 = h * 0.80, rx1 = w * 0.95, ry1 = h * 0.38;
  pole(c, rx0, ry0, rx1, ry1);
  mic(c, rx1, ry1, Math.atan2(ry1 - ry0, rx1 - rx0) + Math.PI * 0.62, h * 0.13, h * 0.045);
  const b = Math.atan2(ry1 - ry0, rx1 - rx0) + Math.PI / 2;
  controllerIcon(c, rx0 + (rx1 - rx0) * 0.35, ry0 + (ry1 - ry0) * 0.35, b, 0.8);
  // straps
  c.save(); c.strokeStyle = C.yellow; c.lineWidth = 5;
  for (const k of [0.30, 0.41]) { const px = rx0 + (rx1 - rx0) * k, py = ry0 + (ry1 - ry0) * k; c.beginPath(); c.ellipse(px, py, 16, 26, Math.atan2(ry1 - ry0, rx1 - rx0), 0, Math.PI * 2); c.stroke(); }
  c.restore();
  label(c, 'ポールモード', w * 0.75, h * 0.90, { size: 26, align: 'center' });
  label(c, '実物のポールにコントローラを固定', w * 0.75, h * 0.96, { size: 17, color: C.dim, align: 'center' });
}

// ④ noise sources: the lamp's power converter and the street outside the window
function soundWaves(c, x, y, r0, color, n = 3) {
  c.save(); c.strokeStyle = color; c.lineWidth = 4;
  for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x, y, r0 + i * 18, -0.9, 0.9); c.stroke(); }
  c.restore();
}
function drawNoise(c, w, h) {
  const floorY = h * 0.84;
  line(c, w * 0.02, floorY, w * 0.98, floorY, '#6b5b4a', 6);
  // window (back wall, left) with the street outside
  c.fillStyle = '#1b2a3c'; rr(c, w * 0.06, h * 0.10, w * 0.22, h * 0.30, 6); c.fill();
  c.strokeStyle = '#d9d5cc'; c.lineWidth = 6; c.strokeRect(w * 0.06, h * 0.10, w * 0.22, h * 0.30);
  line(c, w * 0.17, h * 0.10, w * 0.17, h * 0.40, '#d9d5cc', 6);
  label(c, '窓の外：車の音', w * 0.17, h * 0.47, { size: 22, color: C.dim, align: 'center' });
  soundWaves(c, w * 0.29, h * 0.25, 24, 'rgba(255,149,0,0.9)');
  // lamp stand + converter box on the floor
  const sx = w * 0.40;
  line(c, sx, h * 0.12, sx, floorY, '#222', 6);
  lampIcon(c, sx + 10, h * 0.12, 0.9);
  c.fillStyle = '#2a2d31'; rr(c, sx - 60, floorY - 60, 120, 60, 8); c.fill();
  c.fillStyle = '#f0b429'; c.fillRect(sx - 60, floorY - 38, 120, 12);
  c.fillStyle = '#40ff60'; c.beginPath(); c.arc(sx + 40, floorY - 48, 5, 0, Math.PI * 2); c.fill();
  label(c, '照明のコンバータ：ブーン', sx, floorY + h * 0.07, { size: 22, color: C.dim, align: 'center' });
  soundWaves(c, sx + 70, floorY - 30, 24, 'rgba(255,149,0,0.9)');
  // actor
  const ax = w * 0.72, ay = h * 0.52, ar = h * 0.085;
  body(c, ax, ay + ar * 0.8, ar * 1.9, floorY - (ay + ar * 0.8), '#c9533b');
  const { mouth } = head(c, ax, ay, ar);
  // mic aimed at the actor (OK) and a ghost mic swung toward the converter (NG)
  const tipX = w * 0.78, tipY = h * 0.22;
  pole(c, w * 0.99, h * 0.05, tipX, tipY);
  const aOK = Math.atan2(mouth[1] - tipY, mouth[0] - tipX);
  mic(c, tipX, tipY, aOK + Math.PI, h * 0.17, h * 0.05);
  line(c, tipX, tipY, mouth[0], mouth[1], C.green, 3, [10, 8]);
  badge(c, 'OK', tipX + 20, tipY - 36, '#2d7a44');
  const aNG = Math.atan2(floorY - 40 - tipY, sx + 40 - tipX);
  c.save(); c.globalAlpha = 0.45; mic(c, tipX, tipY, aNG + Math.PI, h * 0.17, h * 0.05); c.restore();
  line(c, tipX, tipY, sx + 60, floorY - 40, 'rgba(255,149,0,0.8)', 3, [10, 8]);
  badge(c, '⚠ NOISE  雑音が入った', w * 0.46, h * 0.56, '#ff9500');
  c.fillStyle = 'rgba(0,0,0,0.45)'; rr(c, w * 0.04, h * 0.90, w * 0.92, h * 0.085, 14); c.fill();
  label(c, 'マイクの軸が雑音源に向くと、雑音が録れてしまう → 減点。背けて録る。', w * 0.07, h * 0.942, { size: 22 });
}
