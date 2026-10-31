import * as THREE from 'three';
import { micDirFrom } from './boom.js';

// Mouse/keyboard boom control for PC play, verification and video capture.
export class DesktopInput {
  constructor(pivot) {
    this.pivot = pivot.clone();
    this.yaw0 = -0.72; this.pitch0 = -0.04;
    this.yaw = this.yaw0; this.pitch = this.pitch0;
    this.len = 2.6; this.lenMin = 1.4; this.lenMax = 3.6;
    this.micYawOff = 0; this.micTiltDeg = 58;
    this.mouseNX = 0.5; this.mouseNY = 0.5;
    this.keys = {};
    this.onKey = () => {};
    window.addEventListener('mousemove', e => { this.mouseNX = e.clientX / innerWidth; this.mouseNY = e.clientY / innerHeight; });
    window.addEventListener('wheel', e => { this.len = THREE.MathUtils.clamp(this.len + Math.sign(e.deltaY) * 0.08, this.lenMin, this.lenMax); }, { passive: true });
    window.addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; this.onKey(e.key, e); });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    this._dir = new THREE.Vector3(); this._mic = new THREE.Vector3();
  }
  setMouse(nx, ny) { this.mouseNX = nx; this.mouseNY = ny; }
  update(dt) {
    this.yaw = this.yaw0 + (this.mouseNX - 0.5) * 1.7;
    this.pitch = THREE.MathUtils.clamp(this.pitch0 - (this.mouseNY - 0.5) * 1.3, -1.2, 1.2);
    const k = this.keys;
    if (k['a']) this.micYawOff += dt * 1.2; if (k['d']) this.micYawOff -= dt * 1.2;
    if (k['w']) this.micTiltDeg -= dt * 50; if (k['s']) this.micTiltDeg += dt * 50;
    this.micTiltDeg = THREE.MathUtils.clamp(this.micTiltDeg, 0, 95);
  }
  pose() {
    const d = this._dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    micDirFrom(d, this.micTiltDeg, this.micYawOff, this._mic);
    return { pivot: this.pivot, dir: d, len: this.len, micDir: this._mic };
  }
}
