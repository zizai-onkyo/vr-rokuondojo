import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

// Boom pole + shotgun mic in a blimp. Pose is given from outside (desktop mouse, VR two-hand, VR pole mode).
export class Boom {
  constructor(scene) {
    this.pivot = new THREE.Vector3();   // rear end of the pole (the hand holding the base)
    this.dir = new THREE.Vector3(0, 0, -1);
    this.len = 2.6;
    this.tip = new THREE.Vector3();
    this.micDir = new THREE.Vector3(0, -1, 0);

    const metal = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .35, metalness: .7 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x262626, roughness: .95 });
    this.group = new THREE.Group(); scene.add(this.group);
    // telescoping look: thick rear section, thin front section
    this.rear = new THREE.Mesh(new THREE.CylinderGeometry(.019, .021, 1, 14), metal); this.rear.castShadow = true; this.group.add(this.rear);
    this.front = new THREE.Mesh(new THREE.CylinderGeometry(.013, .016, 1, 14), metal); this.front.castShadow = true; this.group.add(this.front);
    this.grip = new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .32, 14), rubber); this.grip.castShadow = true; this.group.add(this.grip);
    this.mic = new THREE.Group(); this.group.add(this.mic);
    const blimp = new THREE.Mesh(new THREE.CapsuleGeometry(.052, .24, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: .95 }));
    blimp.castShadow = true; this.mic.add(blimp);
    const fur = new THREE.Mesh(new THREE.CapsuleGeometry(.06, .2, 6, 16), new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 1 })); fur.position.y = -.03; fur.castShadow = true; this.mic.add(fur);
    const mount = new THREE.Mesh(new THREE.BoxGeometry(.045, .05, .07), metal); mount.position.y = .19; mount.castShadow = true; this.mic.add(mount);
    const cable = new THREE.Mesh(new THREE.TorusGeometry(.05, .004, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x111111 })); cable.position.set(0, .2, -.02); cable.rotation.x = Math.PI / 2; this.mic.add(cable);
    // hands (desktop / fallback)
    const handMat = new THREE.MeshStandardMaterial({ color: 0xe8c4a2, roughness: .8 });
    this.handL = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 10), handMat); this.handL.castShadow = true; this.group.add(this.handL);
    this.handR = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 10), handMat); this.handR.castShadow = true; this.group.add(this.handR);
    // simple Touch-style controllers at the hands (visible in headset POV shots)
    const ctrlMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e9, roughness: .6 });
    const mkCtrl = () => {
      const g = new THREE.Group();
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(.016, .07, 4, 10), ctrlMat); grip.castShadow = true; g.add(grip);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.04, .005, 8, 24), ctrlMat); ring.position.set(0, .055, .02); ring.rotation.x = Math.PI / 2.4; ring.castShadow = true; g.add(ring);
      this.group.add(g); return g;
    };
    this.ctrlL = mkCtrl(); this.ctrlR = mkCtrl();
    this._samples = [];
  }

  setPose({ pivot, dir, len, micDir, handL, handR }) {
    this.pivot.copy(pivot); this.dir.copy(dir).normalize(); this.len = len; this.micDir.copy(micDir).normalize();
    this.tip.copy(this.pivot).addScaledVector(this.dir, this.len);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, this.dir);
    const rearLen = Math.min(1.3, this.len * 0.5);
    this.rear.position.copy(this.pivot).addScaledVector(this.dir, rearLen / 2); this.rear.scale.set(1, rearLen, 1); this.rear.quaternion.copy(q);
    const frontLen = this.len - rearLen;
    this.front.position.copy(this.pivot).addScaledVector(this.dir, rearLen + frontLen / 2); this.front.scale.set(1, frontLen, 1); this.front.quaternion.copy(q);
    this.grip.position.copy(this.pivot).addScaledVector(this.dir, .16); this.grip.quaternion.copy(q);
    this.mic.position.copy(this.tip).addScaledVector(this.micDir, 0.17);
    this.mic.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.micDir);
    if (handL) this.handL.position.copy(handL); else this.handL.position.copy(this.pivot).addScaledVector(this.dir, .04);
    if (handR) this.handR.position.copy(handR); else this.handR.position.copy(this.pivot).addScaledVector(this.dir, .6);
    this.ctrlL.position.copy(this.handL.position).addScaledVector(this.dir, -0.02); this.ctrlL.quaternion.copy(q);
    this.ctrlR.position.copy(this.handR.position).addScaledVector(this.dir, -0.02); this.ctrlR.quaternion.copy(q);
  }

  // Points used by the judge: along the pole every 12cm, plus the mic body.
  samplePoints() {
    const out = this._samples; let n = 0;
    const steps = Math.ceil(this.len / 0.12);
    for (let i = 0; i <= steps; i++) { (out[n] ||= new THREE.Vector3()); out[n++].copy(this.pivot).addScaledVector(this.dir, this.len * i / steps); }
    for (const s of [0.05, 0.17, 0.30]) { (out[n] ||= new THREE.Vector3()); out[n++].copy(this.tip).addScaledVector(this.micDir, s); }
    out.length = n;
    return out;
  }

  setVisible(v) { this.group.visible = v; }
}

// Build the mic direction from a pole direction, a downward tilt and a yaw offset ("cueing").
export function micDirFrom(dir, tiltDeg, yawOff, out = new THREE.Vector3()) {
  const right = new THREE.Vector3().crossVectors(dir, UP);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  return out.copy(dir).applyAxisAngle(right, -THREE.MathUtils.degToRad(tiltDeg)).applyAxisAngle(UP, yawOff).normalize();
}

// Sample points for an arbitrary pose (used by the auto-operator solver without touching the live boom)
export function samplePointsFor(pivot, dir, len, tip, micDir, out = []) {
  let n = 0; const steps = Math.ceil(len / 0.12);
  for (let i = 0; i <= steps; i++) { (out[n] ||= new THREE.Vector3()); out[n++].copy(pivot).addScaledVector(dir, len * i / steps); }
  for (const s of [0.05, 0.17, 0.30]) { (out[n] ||= new THREE.Vector3()); out[n++].copy(tip).addScaledVector(micDir, s); }
  out.length = n; return out;
}
