import * as THREE from 'three';
import { makeActor } from './actors.js';
import { LAYER_STUDIO } from './set.js';

// The developer / presenter: a small "studio" outside the set (behind the left wall, never seen by the game cameras),
// a dark backdrop with the brush logo, a key + fill, and a medium-shot camera. Speaks the narration (mouth from the VO bus).
export function buildPresenter(scene) {
  const POS = new THREE.Vector3(-6.5, 0, 5.5);
  const actor = makeActor({ id: 'P', name: '開発者', color: 0x2d3340, skin: 0xe9c2a0, hair: 0x1a1512, x: POS.x, z: POS.z, facingDeg: 0, headphones: true, glasses: 0x2a2a2a });
  scene.add(actor.group);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra });
  // backdrop + logo
  const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.2), std(0x13161c, { roughness: .95 })); back.position.set(POS.x, 2.0, POS.z - 1.4); back.receiveShadow = true; scene.add(back);
  const wingR = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.2), std(0x101318, { roughness: .95 })); wingR.position.set(POS.x + 4.2, 2.0, POS.z + 0.4); wingR.rotation.y = -Math.PI / 2; scene.add(wingR);
  const floorPool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), std(0x2a2520, { roughness: .95 })); floorPool.rotation.x = -Math.PI / 2; floorPool.position.set(POS.x, 0.002, POS.z + 0.3); floorPool.receiveShadow = true; scene.add(floorPool);
  const tex = new THREE.TextureLoader().load('./img/logo_white.png'); tex.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2 * 528 / 2220), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9 }));
  logo.position.set(POS.x + 1.45, 2.25, POS.z - 1.38); scene.add(logo);
  // boom pole held like a staff, mic at the top
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .35, metalness: .7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.014, .018, 2.3, 12), metal); pole.position.set(POS.x - 1.25, 1.12, POS.z - 0.7); pole.rotation.z = 0.2; pole.castShadow = true; scene.add(pole);
  const blimp = new THREE.Mesh(new THREE.CapsuleGeometry(.05, .22, 6, 14), std(0x4a4a4a, { roughness: 1 })); blimp.position.set(POS.x - 1.25 - 0.24, 2.3, POS.z - 0.7); blimp.rotation.z = 0.2; blimp.castShadow = true; scene.add(blimp);
  // light: warm key from camera-right, cool fill from the left, a little rim on the backdrop
  const key = new THREE.SpotLight(0xfff1e0, 170, 10, 0.6, 0.5, 1.4); key.position.set(POS.x + 1.5, 3.0, POS.z + 3.0); key.target.position.set(POS.x, 1.3, POS.z); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; scene.add(key, key.target);
  const fill = new THREE.PointLight(0x9ec8ff, 7, 7, 2); fill.position.set(POS.x - 1.8, 2.0, POS.z + 1.8); scene.add(fill);
  const rim = new THREE.PointLight(0xbfd4ff, 9, 6, 2); rim.position.set(POS.x - 0.9, 2.4, POS.z - 0.9); scene.add(rim);
  // medium shot
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 50); cam.position.set(POS.x + 0.5, 1.36, POS.z + 3.7); cam.lookAt(POS.x + 0.55, 1.22, POS.z);
  const lookAt = cam.position.clone();
  // everything in the studio lives on its own layer so the set cameras never see the backdrop
  for (const o of [actor.group, back, wingR, floorPool, logo, pole, blimp]) o.traverse(m => m.layers.set(LAYER_STUDIO));
  return {
    actor, cam, pos: POS,
    update(dt, t, amp) { actor.update(dt); actor.setMouth(amp); actor.idle(t, amp > 0.05, lookAt); },
  };
}
