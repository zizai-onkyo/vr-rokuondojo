import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }

// Deformed, stylised people: capsule body, big round head, hair cap, jaw that opens with the voice.
// Used for the actors and (with cap / headphones / baseY options) for the crew.
export function makeActor({ id, name, color, skin, hair, x, z = 0, facingDeg = 0, baseY = 0, cap = null, headphones = false, glasses = null, scale = 1 }) {
  const g = new THREE.Group();
  const meshes = [];
  const mk = (geo, mat, pos, { cast = true, recv = true, judge = true } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; m.position.set(...pos); g.add(m);
    if (judge) meshes.push(m); return m;
  };
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: .85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: .7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: .8 });
  mk(new THREE.CapsuleGeometry(.23, .62, 6, 16), bodyMat, [0, .95, 0]);
  mk(new THREE.CapsuleGeometry(.06, .5, 4, 10), bodyMat, [-.3, .95, 0]).rotation.z = .12;
  mk(new THREE.CapsuleGeometry(.06, .5, 4, 10), bodyMat, [.3, .95, 0]).rotation.z = -.12;
  const headPivot = new THREE.Group(); headPivot.position.y = 1.4; g.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 28, 20), skinMat); head.position.y = .16; head.castShadow = head.receiveShadow = true; headPivot.add(head); meshes.push(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.178, 28, 20, 0, Math.PI * 2, 0, 1.45), hairMat); hairCap.position.y = .17; hairCap.rotation.x = -0.35; hairCap.castShadow = true; headPivot.add(hairCap); meshes.push(hairCap);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), new THREE.MeshStandardMaterial({ color: 0x151515 })); e.position.set(s * .065, .2, .15); headPivot.add(e);
    const b = new THREE.Mesh(new THREE.BoxGeometry(.05, .012, .01), hairMat); b.position.set(s * .065, .245, .158); b.rotation.z = s * -0.15; headPivot.add(b);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.018, 8, 8), skinMat); nose.position.set(0, .15, .17); headPivot.add(nose);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(.11, .05, .09), skinMat); jaw.position.set(0, .07, .12); jaw.castShadow = true; headPivot.add(jaw);
  const mouthInner = new THREE.Mesh(new THREE.BoxGeometry(.075, .03, .02), new THREE.MeshStandardMaterial({ color: 0x5a1e1e, roughness: .9 })); mouthInner.position.set(0, .085, .158); headPivot.add(mouthInner);
  const mouth = new THREE.Object3D(); mouth.position.set(0, .085, .17); headPivot.add(mouth);   // scoring target
  const headTop = new THREE.Object3D(); headTop.position.set(0, .34, 0); headPivot.add(headTop);
  if (cap !== null) {   // baseball cap: dome + brim
    const capMat = new THREE.MeshStandardMaterial({ color: cap, roughness: .8 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.186, 24, 16, 0, Math.PI * 2, 0, 1.2), capMat); dome.position.y = .19; dome.castShadow = true; headPivot.add(dome);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(.17, .012, .13), capMat); brim.position.set(0, .255, .2); brim.rotation.x = 0.12; headPivot.add(brim);
  }
  if (headphones) {   // band runs ear to ear over the top of the head (XY plane), tilted slightly back
    const hpMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .6 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(.19, .016, 8, 28, Math.PI), hpMat); band.position.set(0, .16, -.015); band.rotation.x = -0.18; band.castShadow = true; headPivot.add(band);
    for (const s of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(.052, .052, .034, 16), hpMat); cup.position.set(s * .182, .16, 0); cup.rotation.z = Math.PI / 2; cup.castShadow = true; headPivot.add(cup); }
  }
  if (glasses !== null) {   // round frames in front of the eyes, bridge, temples back to the ears
    const gMat = new THREE.MeshStandardMaterial({ color: glasses, roughness: .4, metalness: .3 });
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.04, .0045, 8, 28), gMat); rim.position.set(s * .065, .2, .162); headPivot.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(.038, 24), new THREE.MeshStandardMaterial({ color: 0xbfd8ff, roughness: .1, metalness: .2, transparent: true, opacity: .22 })); lens.position.set(s * .065, .2, .163); headPivot.add(lens);
      const temple = new THREE.Mesh(new THREE.CylinderGeometry(.0035, .0035, .17, 8), gMat); temple.position.set(s * .112, .205, .08); temple.rotation.x = Math.PI / 2; temple.rotation.z = s * -0.12; headPivot.add(temple);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(.05, .006, .006), gMat); bridge.position.set(0, .205, .164); headPivot.add(bridge);
  }
  g.position.set(x, baseY, z); g.rotation.y = THREE.MathUtils.degToRad(facingDeg); g.scale.setScalar(scale);

  const jawBase = jaw.position.y, innerBase = mouthInner.position.y;
  let openSm = 0, bob = 0;
  const mv = { active: false, t: 0, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), yawFrom: 0, yawTo: 0, yawWalk: 0 };
  const api = {
    id, name, group: g, meshes, mouth, headTop, headPivot,
    get walking() { return mv.active; },
    setMouth(open) {
      openSm += (open - openSm) * 0.45;
      jaw.position.y = jawBase - 0.035 * openSm;
      mouthInner.scale.y = 0.25 + 2.2 * openSm;
      mouthInner.position.y = innerBase - 0.017 * openSm;
    },
    // teleport
    place(px, pz, fDeg) { mv.active = false; g.position.x = px; g.position.z = pz; if (fDeg !== undefined) g.rotation.y = THREE.MathUtils.degToRad(fDeg); },
    // walk to a spot (x, z in metres, facing in degrees) over dur seconds
    moveTo({ x: tx, z: tz, facingDeg: tf, dur = 2 }) {
      mv.active = true; mv.t = 0; mv.dur = Math.max(0.2, dur);
      mv.from.copy(g.position); mv.to.set(tx, g.position.y, tz);
      mv.yawFrom = g.rotation.y; mv.yawTo = tf !== undefined ? THREE.MathUtils.degToRad(tf) : g.rotation.y;
      const dx = tx - g.position.x, dz = tz - g.position.z;
      mv.yawWalk = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : mv.yawTo;
    },
    update(dt) {
      if (!mv.active) { bob *= 0.8; return; }
      mv.t += dt;
      const u = Math.min(1, mv.t / mv.dur), e = u * u * (3 - 2 * u);
      g.position.x = mv.from.x + (mv.to.x - mv.from.x) * e;
      g.position.z = mv.from.z + (mv.to.z - mv.from.z) * e;
      bob = Math.abs(Math.sin(mv.t * 7.5)) * 0.03 * Math.sin(u * Math.PI);
      const yawTarget = u < 0.7 ? mv.yawWalk : mv.yawTo;
      g.rotation.y = lerpAngle(g.rotation.y, yawTarget, 1 - Math.exp(-dt * 6));
      if (u >= 1) { mv.active = false; g.rotation.y = mv.yawTo; }
    },
    idle(t, speaking, lookTarget) {
      g.position.y = baseY + bob + Math.sin(t * 1.3 + x) * 0.004;
      // turn the head a little toward the look target, nod slightly while speaking
      if (lookTarget) {
        const local = g.worldToLocal(lookTarget.clone());
        const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.6, 0.6);
        const pitch = THREE.MathUtils.clamp(-Math.atan2(local.y - 1.56, Math.hypot(local.x, local.z)), -0.35, 0.35);
        headPivot.rotation.y += (yaw * 0.6 - headPivot.rotation.y) * 0.05;
        headPivot.rotation.x = pitch * 0.5 + (speaking ? Math.sin(t * 5.1) * 0.03 : Math.sin(t * 0.9) * 0.01);
      } else headPivot.rotation.x = speaking ? Math.sin(t * 5.1) * 0.03 : Math.sin(t * 0.9) * 0.01;
    },
  };
  return api;
}

// Read an actor's look from script JSON: { color, skin, hair, x, z, facingDeg }
export function actorFromScript(a, fallbackIndex = 0) {
  const look = a.look || {};
  const palette = [[0xc9533b, 0xf1c9a5, 0x3b2a22], [0x4e7bd3, 0xf3d2b3, 0x6b4330], [0x4f8a5b, 0xe9c19c, 0x1d1b1a]];
  const p = palette[fallbackIndex % palette.length];
  const col = v => (v === undefined ? null : new THREE.Color(v).getHex());
  return makeActor({
    id: a.id, name: a.name,
    color: col(look.color) ?? p[0], skin: col(look.skin) ?? p[1], hair: col(look.hair) ?? p[2],
    x: look.x ?? (fallbackIndex === 0 ? -0.62 : 0.62), z: look.z ?? 0, facingDeg: look.facingDeg ?? (fallbackIndex === 0 ? 35 : -35),
  });
}
