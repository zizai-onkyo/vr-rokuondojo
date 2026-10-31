import * as THREE from 'three';

// --- scoring curves ----------------------------------------------------------------
// Shotgun (lobar) pattern: full score within 8° of the axis, smooth fall-off to ~0 at 50°.
export function directivityScore(angleDeg) {
  if (angleDeg <= 8) return 1;
  if (angleDeg >= 50) return 0.03;
  const t = (angleDeg - 8) / 42;
  return 1 - t * t * (3 - 2 * t) * 0.97;
}
// Distance: full score up to dFull, zero at dZero. Quiet lines need the mic closer, loud lines can be picked from further away.
export const LEVEL_DIST = { whisper: { full: 0.45, zero: 1.40 }, normal: { full: 0.60, zero: 1.80 }, loud: { full: 0.80, zero: 2.40 } };
export function distanceScore(d, level = 'normal') {
  const { full, zero } = LEVEL_DIST[level] || LEVEL_DIST.normal;
  return THREE.MathUtils.clamp(1 - (d - full) / (zero - full), 0, 1);
}
export const CONTACT_DIST = 0.22;   // mic touching the actor's head
// Noise sources: how much of a source the mic picks up (0..1) = directivity toward it × distance factor × source level.
export const NOISE_REF = 2.2;       // on-axis within this distance → full pickup
export const NOISE_BAD = 0.45;      // above this the take is "noisy" (penalty + warning)

// --- geometry judge ---------------------------------------------------------------
export class Judge {
  constructor({ filmCam, lights, receivers, occluders, noiseSources = [] }) {
    this.filmCam = filmCam; this.lights = lights; this.receivers = receivers; this.occluders = occluders; this.noiseSources = noiseSources;
    this.ray = new THREE.Raycaster();
    this.result = { angleDeg: 0, dist: 0, dirScore: 0, distScore: 0, inFrame: false, inFrameCount: 0, shadowInFrame: false, shadowCount: 0, shadowHits: [], contact: false, noise: [], noiseMax: 0, noiseIndex: -1, noiseBad: false };
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._ldir = new THREE.Vector3();
  }

  inFrustum(p) {
    this._w.copy(p).project(this.filmCam);
    return Math.abs(this._w.x) <= 1 && Math.abs(this._w.y) <= 1 && this._w.z > -1 && this._w.z < 1;
  }

  evaluate({ samplePts, tip, micDir, mouthPos, level, skipShadow = false }) {
    const r = this.result, v = this._v, w = this._w;
    // mic vs mouth
    v.copy(mouthPos).sub(tip);
    r.dist = v.length();
    r.angleDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(micDir.dot(v.normalize()), -1, 1)));
    r.dirScore = directivityScore(r.angleDeg);
    r.distScore = distanceScore(r.dist, level);
    r.contact = r.dist < CONTACT_DIST;

    // noise sources picked up by the mic
    r.noiseMax = 0; r.noiseIndex = -1;
    for (let i = 0; i < this.noiseSources.length; i++) {
      const ns = this.noiseSources[i];
      v.copy(ns.pos).sub(tip); const d = v.length(); v.normalize();
      const ang = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(micDir.dot(v), -1, 1)));
      const pick = directivityScore(ang) * THREE.MathUtils.clamp(NOISE_REF / Math.max(d, 0.3), 0, 1) * (ns.level ?? 1);
      r.noise[i] = pick;
      if (pick > r.noiseMax) { r.noiseMax = pick; r.noiseIndex = i; }
    }
    r.noise.length = this.noiseSources.length;
    r.noiseBad = r.noiseMax > NOISE_BAD;

    // boom / mic inside the film frame?
    r.inFrameCount = 0;
    for (const p of samplePts) if (this.inFrustum(p)) r.inFrameCount++;
    r.inFrame = r.inFrameCount > 0;

    // shadow of the boom visible inside the film frame?
    r.shadowCount = 0; r.shadowHits.length = 0;
    if (!skipShadow) for (const light of this.lights) {
      let cosCone = -2;
      if (light.isSpotLight) { this._ldir.copy(light.target.position).sub(light.position).normalize(); cosCone = Math.cos(light.angle); }
      else if (light.isDirectionalLight) { this._ldir.copy(light.target.position).sub(light.position).normalize(); }
      else continue;
      for (const p of samplePts) {
        if (light.isSpotLight) { v.copy(p).sub(light.position); v.normalize(); if (v.dot(this._ldir) < cosCone) continue; }
        else v.copy(this._ldir);
        this.ray.set(w.copy(p).addScaledVector(v, 0.02), v); this.ray.far = 25;
        const hit = this.ray.intersectObjects(this.receivers, false)[0];
        if (!hit) continue;
        if (!this.inFrustum(hit.point)) continue;
        // visible from the film camera (not hidden behind an actor / prop)?
        w.copy(hit.point).sub(this.filmCam.position); const dCH = w.length(); w.divideScalar(dCH);
        this.ray.set(this.filmCam.position, w); this.ray.far = dCH + 0.05;
        const vis = this.ray.intersectObjects(this.occluders, false)[0];
        if (vis && vis.distance < dCH - 0.03) continue;
        r.shadowCount++;
        r.shadowHits.push(hit.point.clone());
      }
    }
    r.shadowInFrame = r.shadowCount >= 2;   // ≥2 sample points: ignores a grazing single point (soft-edge tolerance)
    return r;
  }
}
