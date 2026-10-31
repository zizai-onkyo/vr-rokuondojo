// Take scoring. Points per second while an actor speaks; penalties any time the boom is in frame, its shadow is, or a noise source is being picked up.
export const RATES = { base: 100, frame: -40, shadow: -80, contact: -60, noise: -30 };

export class Score {
  constructor() { this.reset(null); }
  reset(script) {
    this.score = 0; this.rate = 0; this.max = 0; this.frameSec = 0; this.shadowSec = 0; this.contactSec = 0; this.noiseSec = 0; this.speakSec = 0;
    this.lines = script ? script.lines.map(l => ({ text: l.text, actor: l.actor, level: l.level, sec: 0, sumAngle: 0, sumDist: 0, onAxisSec: 0, points: 0, frameSec: 0, shadowSec: 0 })) : [];
    if (script) this.max = script.lines.reduce((s, l) => s + (l.duration || 0) * RATES.base, 0);
  }
  update(dt, current, j) {
    let rate = 0;
    if (current) {
      const l = this.lines[current.index];
      // noise in the pickup lowers the signal-to-noise of the recording → fewer points for the line
      const snr = 1 - 0.5 * Math.max(0, (j.noiseMax || 0) - 0.15);
      const pts = RATES.base * j.dirScore * j.distScore * snr;
      rate += pts; this.speakSec += dt;
      l.sec += dt; l.sumAngle += j.angleDeg * dt; l.sumDist += j.dist * dt; l.points += pts * dt;
      if (j.angleDeg <= 15) l.onAxisSec += dt;
      if (j.inFrame) l.frameSec += dt; if (j.shadowInFrame) l.shadowSec += dt;
    }
    if (j.inFrame) { rate += RATES.frame; this.frameSec += dt; }
    if (j.shadowInFrame) { rate += RATES.shadow; this.shadowSec += dt; }
    if (j.contact) { rate += RATES.contact; this.contactSec += dt; }
    if (j.noiseBad) { rate += RATES.noise; this.noiseSec += dt; }
    this.rate = rate; this.score += rate * dt;
    return rate;
  }
  results() {
    const recorded = this.speakSec * RATES.base;   // points available for the lines actually spoken so far
    const ratio = recorded > 0 ? Math.max(0, this.score) / recorded : 0;
    let rank = 'C'; if (ratio >= 0.75) rank = 'S'; else if (ratio >= 0.6) rank = 'A'; else if (ratio >= 0.4) rank = 'B';
    if (this.shadowSec > 3 && rank === 'S') rank = 'A';
    return {
      score: Math.round(this.score), max: Math.round(recorded), ratio, rank,
      frameSec: this.frameSec, shadowSec: this.shadowSec, contactSec: this.contactSec, noiseSec: this.noiseSec,
      lines: this.lines.map(l => ({ ...l, avgAngle: l.sec ? l.sumAngle / l.sec : 0, avgDist: l.sec ? l.sumDist / l.sec : 0, onAxis: l.sec ? l.onAxisSec / l.sec : 0, eff: l.sec ? l.points / (l.sec * RATES.base) : 0 })),
    };
  }
}
