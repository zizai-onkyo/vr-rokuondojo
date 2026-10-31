import * as THREE from 'three';

// "AI boom operator" used for the auto demo and for video capture. Behaviours:
//  good   : hover just above the frame line over the speaker, mic cued to the mouth (solver picks the closest safe spot)
//  dip    : too greedy — drops the mic into the frame
//  shadow : drifts back/up on the light side so the boom shadows the back wall inside the frame
//  lazy   : slow to cue the next speaker (off-axis for a while)
//  far    : stays safely high and far (clean frame, weak sound)
//  noise  : keeps the safe pole position but swings the mic toward `noiseTarget` (a noise source)
export class AutoOperator {
  constructor(pivot) {
    this.pivot = pivot.clone();
    this.behavior = 'good';
    this.yaw = -0.72; this.pitch = -0.04; this.len = 2.6;
    this.speed = 4; this.cueSpeed = 6;
    this._want = new THREE.Vector3(); this._dir = new THREE.Vector3(); this._mic = new THREE.Vector3(0, -1, 0);
    this._aim = new THREE.Vector3(); this._mouthSm = new THREE.Vector3(); this._init = false; this._tgt = new THREE.Vector3();
    this.solve = null; this._lastSolveMouth = new THREE.Vector3(1e9, 0, 0); this._sinceSolve = 0; this._lift = 0;
    this.noiseTarget = null;
    this.offset = { good: [0.05, 0.62, 0.22], dip: [0.0, 0.32, 0.18], shadow: [-0.35, 0.95, -0.55], lazy: [0.05, 0.62, 0.22], far: [0.1, 1.0, 0.45] };
  }
  update(dt, mouthPos, j = null) {
    this._sinceSolve += dt;
    const safe = this.behavior === 'good' || this.behavior === 'noise' || this.behavior === 'lazy';
    const trouble = j && (j.inFrame || j.shadowInFrame) && this._sinceSolve > 0.4;   // reactive: fix a bad pose right away
    if (safe && this.solve && (trouble || this._lastSolveMouth.distanceTo(mouthPos) > 0.25 || this._sinceSolve > 2.0)) {
      const jump = this._lastSolveMouth.distanceTo(mouthPos);
      if (jump > 0.6 && this._init) this._lift = Math.min(0.85, 0.45 * jump);   // lift up-and-over when cueing to another actor (higher for a longer swing)
      this.offset.good = this.solve(mouthPos, this.pivot) || this.offset.good;
      this._lastSolveMouth.copy(mouthPos); this._sinceSolve = 0;
    }
    this._lift *= Math.exp(-dt * 2.2);
    const o0 = this.offset[this.behavior] || this.offset.good;
    const o = [o0[0], o0[1] + (safe ? this._lift : 0), o0[2]];
    if (!this._init) { this._mouthSm.copy(mouthPos); this._init = true; }
    const k = 1 - Math.exp(-dt * (this.behavior === 'lazy' ? 0.8 : this.speed));
    this._mouthSm.lerp(mouthPos, k);
    this._want.set(this._mouthSm.x + o[0], this._mouthSm.y + o[1], this._mouthSm.z + o[2]).sub(this.pivot);
    const wantLen = THREE.MathUtils.clamp(this._want.length(), 1.4, 3.6);
    const wantYaw = Math.atan2(this._want.x, -this._want.z), wantPitch = Math.asin(THREE.MathUtils.clamp(this._want.y / this._want.length(), -1, 1));
    this.yaw += (wantYaw - this.yaw) * k; this.pitch += (wantPitch - this.pitch) * k; this.len += (wantLen - this.len) * k;
    this._dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const tip = this._aim.copy(this.pivot).addScaledVector(this._dir, this.len);
    const kc = 1 - Math.exp(-dt * (this.behavior === 'lazy' ? 1.2 : this.cueSpeed));
    const aimAt = (this.behavior === 'noise' && this.noiseTarget) ? this.noiseTarget : this._mouthSm;
    this._tgt.copy(aimAt).sub(tip).normalize();
    this._mic.lerp(this._tgt, kc).normalize();
    return { pivot: this.pivot, dir: this._dir, len: this.len, micDir: this._mic };
  }
}
