import * as THREE from 'three';
import { micDirFrom } from './boom.js';

const UP = new THREE.Vector3(0, 1, 0);

// WebXR boom control.
//  two-hand : left grip = rear of the pole, right grip = forward hand. Twist the right hand to cue the mic.
//  pole     : one controller strapped to a real pole. Calibrate once (hold the pole level, pointing at the set, pull trigger).
export class XRInput {
  constructor(renderer, scene, rig) {
    this.renderer = renderer; this.rig = rig;
    this.mode = 'two-hand';
    this.len = 2.6; this.lenMin = 1.4; this.lenMax = 3.6;
    this.micTiltDeg = 58; this.micYawOff = 0;
    this.pole = { controller: 'right', axisLocal: new THREE.Vector3(0, 0, -1), mountFromRear: 0.9, length: 2.6, rollRef: 0 };
    this.grips = [renderer.xr.getControllerGrip(0), renderer.xr.getControllerGrip(1)];
    this.byHand = { left: null, right: null };
    this.sources = { left: null, right: null };
    this.buttons = { aPressed: false, bPressed: false, xPressed: false, yPressed: false, trigL: false, trigR: false };
    this.onButton = () => {};
    this._prev = {};
    for (const g of this.grips) {
      rig.add(g);
      const vis = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8c4a2 }));
      g.add(vis);
      g.addEventListener('connected', e => { const h = e.data.handedness || 'right'; this.byHand[h] = g; this.sources[h] = e.data; });
      g.addEventListener('disconnected', () => { for (const h of ['left', 'right']) if (this.byHand[h] === g) { this.byHand[h] = null; this.sources[h] = null; } });
    }
    this._pL = new THREE.Vector3(); this._pR = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this._dir = new THREE.Vector3(); this._mic = new THREE.Vector3(); this._pivot = new THREE.Vector3();
    this._x = new THREE.Vector3(); this._tmp = new THREE.Vector3();
  }

  _gamepad(hand) { const s = this.sources[hand]; return s && s.gamepad; }
  _edge(name, down) { const was = this._prev[name] || false; this._prev[name] = down; return down && !was; }

  update(dt) {
    // buttons: right A (4) = take, right B (5) = toggle mode, left X (4) = calibrate pole, triggers (0)
    const gr = this._gamepad('right'), gl = this._gamepad('left');
    if (gr) {
      if (this._edge('A', gr.buttons[4]?.pressed)) this.onButton('take');
      if (this._edge('B', gr.buttons[5]?.pressed)) this.onButton('mode');
      if (this._edge('trigR', gr.buttons[0]?.pressed)) this.onButton('trigR');
      const sy = gr.axes[3] ?? 0; if (Math.abs(sy) > 0.2) this.len = THREE.MathUtils.clamp(this.len - sy * dt * 0.9, this.lenMin, this.lenMax);
    }
    if (gl) {
      if (this._edge('X', gl.buttons[4]?.pressed)) this.onButton('calibrate');
      if (this._edge('Y', gl.buttons[5]?.pressed)) this.onButton('camera');
      const sy = gl.axes[3] ?? 0; if (Math.abs(sy) > 0.2) this.micTiltDeg = THREE.MathUtils.clamp(this.micTiltDeg + sy * dt * 45, 0, 95);
      const sx = gl.axes[2] ?? 0; if (Math.abs(sx) > 0.2) this.micYawOff -= sx * dt * 1.0;
    }
  }

  // roll of a controller about the pole axis, measured as the angle of its local X axis around `dir`
  _rollAbout(grip, dir) {
    this._x.set(1, 0, 0).applyQuaternion(grip.getWorldQuaternion(this._q));
    const right = this._tmp.crossVectors(dir, UP).normalize();
    const upP = new THREE.Vector3().crossVectors(right, dir).normalize();
    this._x.addScaledVector(dir, -this._x.dot(dir)).normalize();
    return Math.atan2(this._x.dot(upP), this._x.dot(right));
  }

  calibratePole(forwardWorld) {
    const g = this.byHand[this.pole.controller]; if (!g) return false;
    const qInv = g.getWorldQuaternion(this._q).clone().invert();
    this.pole.axisLocal.copy(forwardWorld).normalize().applyQuaternion(qInv);
    this.pole.rollRef = this._rollAbout(g, forwardWorld);
    return true;
  }

  pose() {
    const L = this.byHand.left, R = this.byHand.right;
    if (this.mode === 'two-hand') {
      if (!L || !R) return null;
      L.getWorldPosition(this._pL); R.getWorldPosition(this._pR);
      this._dir.copy(this._pR).sub(this._pL);
      if (this._dir.lengthSq() < 1e-4) return null;
      this._dir.normalize();
      const roll = this._rollAbout(R, this._dir);
      micDirFrom(this._dir, this.micTiltDeg, this.micYawOff + roll, this._mic);
      return { pivot: this._pL, dir: this._dir, len: this.len, micDir: this._mic, handL: this._pL, handR: this._pR };
    }
    const g = this.byHand[this.pole.controller]; if (!g) return null;
    this._dir.copy(this.pole.axisLocal).applyQuaternion(g.getWorldQuaternion(this._q)).normalize();
    g.getWorldPosition(this._pR);
    this._pivot.copy(this._pR).addScaledVector(this._dir, -this.pole.mountFromRear);
    const roll = this._rollAbout(g, this._dir) - this.pole.rollRef;
    micDirFrom(this._dir, this.micTiltDeg, this.micYawOff + roll, this._mic);
    return { pivot: this._pivot, dir: this._dir, len: this.pole.length, micDir: this._mic, handL: this._pivot, handR: this._pR };
  }
}
