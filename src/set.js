import * as THREE from 'three';

export const LAYER_CAMPROP = 3;   // (layers 1/2 are reserved by three.js for the XR left/right eye)   // film-camera body etc. — never seen by the film camera itself
export const LAYER_DEBUG = 4;       // helpers — never seen by the film camera
export const LAYER_STUDIO = 5;      // the presenter's studio — seen only by the studio camera (10)

// Where the boom operator stands (camera-right, a little in front of the camera)
export const OPERATOR_POS = new THREE.Vector3(1.75, 0, 2.1);

export function buildSet(scene) {
  const receivers = [];   // meshes the boom's shadow can land on
  const occluders = [];   // meshes that can hide a shadow from the film camera
  const reg = m => { receivers.push(m); occluders.push(m); return m; };
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra });
  const add = (geo, mat, pos, { cast = true, recv = true, judge = true, rot = null, parent = scene } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    parent.add(m); if (judge) reg(m); return m;
  };

  // ---- room ---------------------------------------------------------------
  add(new THREE.PlaneGeometry(18, 18), std(0x5b4d3e, { roughness: .95 }), [0, 0, 0], { cast: false, rot: [-Math.PI / 2, 0, 0] });
  add(new THREE.PlaneGeometry(14, 4.6), std(0x8a949a), [0, 2.3, -3.2], { cast: false });                      // back wall
  add(new THREE.PlaneGeometry(10, 4.6), std(0x7d878d), [-4.2, 2.3, 1.0], { cast: false, rot: [0, Math.PI / 2, 0] });  // left wall
  // window on the back wall (night glass, faint street light outside + frame)
  add(new THREE.PlaneGeometry(1.6, 1.3), new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: .2, metalness: .4, emissive: 0x1b2a3c, emissiveIntensity: .6 }), [-1.9, 1.9, -3.19], { cast: false, judge: false });
  add(new THREE.BoxGeometry(0.06, 1.4, 0.06), std(0xd9d5cc), [-1.9, 1.9, -3.17], { judge: false });   // centre mullion
  add(new THREE.BoxGeometry(1.7, 0.06, 0.06), std(0xd9d5cc), [-1.9, 2.58, -3.17], { judge: false });
  add(new THREE.BoxGeometry(1.7, 0.06, 0.06), std(0xd9d5cc), [-1.9, 1.22, -3.17], { judge: false });
  add(new THREE.BoxGeometry(0.06, 1.4, 0.06), std(0xd9d5cc), [-2.75, 1.9, -3.17], { judge: false });
  add(new THREE.BoxGeometry(0.06, 1.4, 0.06), std(0xd9d5cc), [-1.05, 1.9, -3.17], { judge: false });
  // poster
  add(new THREE.PlaneGeometry(0.7, 1.0), std(0xc96a4a), [1.6, 1.9, -3.19], { cast: false, judge: false });

  // ---- furniture (上京前夜: sofa, low table, cardboard boxes, floor lamp) -------
  const sofaMat = std(0x3f5b6d, { roughness: .85 });
  add(new THREE.BoxGeometry(2.2, .42, .85), sofaMat, [0, .21, -2.2]);
  add(new THREE.BoxGeometry(2.2, .5, .22), sofaMat, [0, .66, -2.52]);
  add(new THREE.BoxGeometry(.22, .5, .85), sofaMat, [-1.0, .5, -2.2]);
  add(new THREE.BoxGeometry(.22, .5, .85), sofaMat, [1.0, .5, -2.2]);
  add(new THREE.CylinderGeometry(.38, .38, .05, 28), std(0x8a6a45, { roughness: .55 }), [0, .46, -0.35]);
  add(new THREE.CylinderGeometry(.035, .035, .46, 12), std(0x333333), [0, .23, -0.35]);
  const box = std(0xb08a5a, { roughness: .95 });
  add(new THREE.BoxGeometry(.55, .4, .45), box, [-2.2, .2, -1.6], { rot: [0, .3, 0] });
  add(new THREE.BoxGeometry(.5, .35, .4), box, [-2.25, .575, -1.6], { rot: [0, -.2, 0] });
  add(new THREE.BoxGeometry(.6, .42, .5), box, [2.4, .21, -1.2], { rot: [0, -.4, 0] });
  add(new THREE.BoxGeometry(.45, .3, .4), box, [-1.4, .15, -2.9]);
  // floor lamp (practical)
  add(new THREE.CylinderGeometry(.02, .02, 1.5, 10), std(0x222222), [2.9, .75, -2.6], { judge: false });
  add(new THREE.CylinderGeometry(.16, .22, .28, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xf1e2c0, emissive: 0xffd9a0, emissiveIntensity: .9, side: THREE.DoubleSide }), [2.9, 1.55, -2.6], { cast: false, judge: false });
  const practical = new THREE.PointLight(0xffc98a, 6, 6, 2); practical.position.set(2.9, 1.5, -2.6); scene.add(practical);

  // ---- film camera ---------------------------------------------------------
  const filmCam = new THREE.PerspectiveCamera(24, 16 / 9, 0.1, 60);   // ≈55mm on S35, medium two-shot
  filmCam.position.set(0.25, 1.45, 3.5);
  filmCam.lookAt(0, 1.28, 0);
  filmCam.layers.disable(LAYER_CAMPROP);
  filmCam.layers.disable(LAYER_DEBUG);
  scene.add(filmCam);
  {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: .5, metalness: .35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(.30, .24, .40), m); g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(.12, .08, .25), m); top.position.set(0, .16, .02); g.add(top);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.065, .075, .26, 24), m); lens.rotation.x = Math.PI / 2; lens.position.z = -.32; g.add(lens);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(.2, .17, .12), m); hood.position.z = -.48; g.add(hood);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(.2, .12, .02), new THREE.MeshStandardMaterial({ color: 0x9ec8ff, emissive: 0x2f5a8a, emissiveIntensity: 1.2 })); mon.position.set(.22, .12, .1); g.add(mon);
    const tally = new THREE.Mesh(new THREE.SphereGeometry(.015, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 3 })); tally.position.set(-.1, .14, -.1); g.add(tally);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 1.4, 8), m);
      const a = i * Math.PI * 2 / 3; leg.position.set(Math.sin(a) * .32, -.82, Math.cos(a) * .32); leg.rotation.z = Math.sin(a) * .23; leg.rotation.x = -Math.cos(a) * .23; g.add(leg);
    }
    g.traverse(o => { o.layers.set(LAYER_CAMPROP); o.castShadow = true; });
    g.position.copy(filmCam.position); g.quaternion.copy(filmCam.quaternion);
    scene.add(g);
  }

  // ---- lights --------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xc9d4e6, 0x3a2e24, 0.5); scene.add(hemi);
  // key: steep, camera-left. Steep so a well-placed boom shadows the floor out of frame — the puzzle has a solution.
  const key = new THREE.SpotLight(0xfff0dc, 420, 16, THREE.MathUtils.degToRad(31), 0.45, 1.6);
  key.position.set(-2.2, 3.5, 1.9);
  key.target.position.set(0, 1.25, -0.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 16;
  scene.add(key, key.target);
  { // fixture
    const fx = new THREE.Mesh(new THREE.CylinderGeometry(.15, .22, .32, 18), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe9c8, emissiveIntensity: 1.2 }));
    fx.position.copy(key.position); fx.lookAt(key.target.position); fx.rotateX(Math.PI / 2); fx.layers.set(LAYER_CAMPROP); scene.add(fx);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 3.5, 8), std(0x222222)); stand.position.set(-2.2, 1.75, 1.9); stand.layers.set(LAYER_CAMPROP); scene.add(stand);
  }
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.7); fill.position.set(3.5, 2.6, 3.0); scene.add(fill);   // soft fill, not judged

  // ---- noise sources (items): the lamp's power converter / ballast humming at the foot of the stand, and the street outside the window
  const ballastPos = new THREE.Vector3(-2.45, 0.16, 2.15);
  {
    const bx = add(new THREE.BoxGeometry(.34, .26, .22), std(0x2a2d31, { roughness: .6, metalness: .3 }), ballastPos.toArray(), { judge: false });
    add(new THREE.BoxGeometry(.35, .05, .23), std(0xf0b429), [ballastPos.x, ballastPos.y + .06, ballastPos.z], { judge: false });   // yellow band
    const led = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 8), new THREE.MeshStandardMaterial({ color: 0x40ff60, emissive: 0x40ff60, emissiveIntensity: 3 })); led.position.set(ballastPos.x + .12, ballastPos.y + .09, ballastPos.z + .115); scene.add(led);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(.14, .10), std(0x111111)); grille.position.set(ballastPos.x - .06, ballastPos.y + .02, ballastPos.z + .112); scene.add(grille);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, 1.9, 6), std(0x111111)); cable.position.set((ballastPos.x + key.position.x) / 2, 0.95, (ballastPos.z + key.position.z) / 2); cable.rotation.z = 0.13; cable.rotation.x = 0.1; cable.layers.set(LAYER_CAMPROP); scene.add(cable);
    bx.layers.set(0);
  }
  const noiseSources = [
    { name: '照明コンバータ', kind: 'hum', pos: ballastPos.clone().add(new THREE.Vector3(0, 0.05, 0)), level: 1.0 },
    { name: '窓の外', kind: 'traffic', pos: new THREE.Vector3(-1.9, 1.9, -3.25), level: 1.0 },
  ];

  // ---- on-set monitor (what the player watches to stay out of frame) ------------------
  const monitorRT = new THREE.WebGLRenderTarget(1024, 576, { depthBuffer: true });
  const monitor = new THREE.Group();
  {
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(.62, .38, .035), std(0x151515, { roughness: .6 })); monitor.add(bezel);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.56, .315), new THREE.MeshBasicMaterial({ map: monitorRT.texture })); screen.position.z = .019; monitor.add(screen);
    const overlayCanvas = document.createElement('canvas'); overlayCanvas.width = 512; overlayCanvas.height = 288;
    const overlayTex = new THREE.CanvasTexture(overlayCanvas); overlayTex.colorSpace = THREE.SRGBColorSpace;
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(.56, .315), new THREE.MeshBasicMaterial({ map: overlayTex, transparent: true })); overlay.position.z = .021; monitor.add(overlay);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.3, 8), std(0x222222)); arm.position.set(0, -.75, -.1); monitor.add(arm);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.3, .32, .03, 16), std(0x222222)); base.position.set(0, -1.39, -.1); monitor.add(base);
    monitor.traverse(o => o.layers.set(LAYER_CAMPROP));
    monitor.position.set(2.75, 1.42, 0.9);
    monitor.lookAt(OPERATOR_POS.x, 1.6, OPERATOR_POS.z);
    scene.add(monitor);
    monitor.userData = { overlayCanvas, overlayTex, rt: monitorRT };
  }

  // ---- frame-line helper: film frame drawn at the actors' depth ----------------------
  const frameLines = (() => {
    const D = filmCam.position.distanceTo(new THREE.Vector3(0, 1.28, 0));
    const halfH = D * Math.tan(THREE.MathUtils.degToRad(filmCam.fov / 2)), halfW = halfH * filmCam.aspect;
    const fwd = new THREE.Vector3(); filmCam.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const c = new THREE.Vector3().copy(filmCam.position).addScaledVector(fwd, D);
    const corner = (sx, sy) => c.clone().addScaledVector(right, sx * halfW).addScaledVector(upv, sy * halfH);
    const pts = [corner(-1, 1), corner(1, 1), corner(1, 1), corner(1, -1), corner(1, -1), corner(-1, -1), corner(-1, -1), corner(-1, 1)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffd400 }));
    l.layers.set(LAYER_DEBUG); l.visible = false; scene.add(l); return l;
  })();

  return { receivers, occluders, filmCam, shadowLights: [key], lights: { key, fill, hemi, practical }, monitor, frameLines, noiseSources };
}
