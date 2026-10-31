import * as THREE from 'three';
import { makeActor } from './actors.js';

// Film crew on the camera side: director (seated at a monitor), camera operator, assistant with the slate, gaffer at the key light.
// They are decoration + the "よーい、スタート / カット" voice; none of them is judged for shadows or frame intrusion.
export function buildCrew(scene, { filmCam, keyPos, monitorRT }) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra });
  const prop = (geo, mat, pos, rot, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.position.set(...pos); if (rot) m.rotation.set(...rot); parent.add(m); return m; };

  // --- director: seated camera-left behind the camera, headphones, cap, director's monitor in front
  const DIR = { x: -1.45, z: 3.85, facing: 175 };
  const director = makeActor({ id: 'DIR', name: '監督', color: 0x4a5264, skin: 0xe4b894, hair: 0x2a2420, x: DIR.x, z: DIR.z, facingDeg: DIR.facing, baseY: -0.38, cap: 0x1c1c1c, headphones: true });
  scene.add(director.group);
  { // director's chair
    const wood = std(0x6b4a2e, { roughness: .7 }), canvas = std(0x1f2a33);
    prop(new THREE.BoxGeometry(.5, .04, .5), canvas, [DIR.x, .46, DIR.z]);
    prop(new THREE.BoxGeometry(.5, .32, .04), canvas, [DIR.x, .80, DIR.z + .24]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prop(new THREE.CylinderGeometry(.015, .015, .46, 8), wood, [DIR.x + sx * .22, .23, DIR.z + sz * .22]);
    for (const sx of [-1, 1]) prop(new THREE.CylinderGeometry(.015, .015, .5, 8), wood, [DIR.x + sx * .25, .72, DIR.z + .24]);
  }
  const dirMonitor = new THREE.Group();
  {
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(.5, .31, .03), std(0x151515, { roughness: .6 })); dirMonitor.add(bezel);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.45, .253), new THREE.MeshBasicMaterial({ map: monitorRT.texture })); screen.position.z = .017; dirMonitor.add(screen);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 1.0, 8), std(0x222222)); arm.position.set(0, -.6, -.08); dirMonitor.add(arm);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.26, .28, .03, 16), std(0x222222)); base.position.set(0, -1.1, -.08); dirMonitor.add(base);
    dirMonitor.position.set(DIR.x - 0.05, 1.12, DIR.z - 0.85);
    dirMonitor.lookAt(DIR.x, 1.2, DIR.z);
    dirMonitor.traverse(o => { o.castShadow = true; });
    scene.add(dirMonitor);
    const glow = new THREE.PointLight(0x9ec8ff, 2.5, 3.5, 2); glow.position.set(DIR.x, 1.3, DIR.z - 0.5); scene.add(glow);
    const work = new THREE.PointLight(0xffe2c0, 4, 7, 2); work.position.set(0.4, 2.9, 4.6); scene.add(work);
  }

  // --- camera operator: right behind the camera, eye on the flip-out monitor
  const camOp = makeActor({ id: 'CAM', name: 'カメラマン', color: 0x3b4252, skin: 0xf0c8a6, hair: 0x1a1512, x: filmCam.position.x + 0.30, z: filmCam.position.z + 0.55, facingDeg: 188, cap: 0x2f3a4a });
  scene.add(camOp.group);

  // --- assistant with the slate (clapperboard): waits camera-left, steps in for the slate at "よーい"
  const AC_HOME = { x: -1.35, z: 3.1, facing: 140 }, AC_SLATE = { x: -0.22, z: 2.25, facing: 8 };
  const ac = makeActor({ id: 'AC', name: '助監督', color: 0x4a6a50, skin: 0xf3d2b3, hair: 0x3b2a22, x: AC_HOME.x, z: AC_HOME.z, facingDeg: AC_HOME.facing });
  scene.add(ac.group);
  const slate = new THREE.Group();
  {
    const black = std(0x101010, { roughness: .6 }), white = std(0xf2f2f2, { roughness: .6 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(.28, .20, .014), black); slate.add(board);
    const stripes = new THREE.Mesh(new THREE.BoxGeometry(.28, .04, .015), white); stripes.position.y = .08; slate.add(stripes);
    const text = new THREE.Mesh(new THREE.PlaneGeometry(.22, .09), new THREE.MeshBasicMaterial({ map: slateTexture() })); text.position.set(0, -.02, .0085); slate.add(text);
    const hinge = new THREE.Group(); hinge.position.set(-.14, .10, 0); slate.add(hinge);
    const stick = new THREE.Mesh(new THREE.BoxGeometry(.28, .04, .014), black); stick.position.set(.14, .02, 0); hinge.add(stick);
    const stripes2 = new THREE.Mesh(new THREE.BoxGeometry(.28, .04, .015), white); stripes2.position.set(.14, .02, 0); stripes2.scale.set(1, .5, 1); stripes2.position.y = .03; hinge.add(stripes2);
    slate.userData.hinge = hinge;
    slate.traverse(o => { o.castShadow = true; });
    ac.group.add(slate);
  }
  const SLATE_DOWN = { pos: [.30, .80, .12], rot: [0.35, 0, -0.3] }, SLATE_UP = { pos: [.26, 1.30, .30], rot: [0, 0.1, 0] };
  const slateState = { up: 0, clap: 0, open: 0.55 };
  const setSlate = (p, up) => { const q = up ? SLATE_UP : SLATE_DOWN; slate.position.set(...q.pos); slate.rotation.set(...q.rot); };
  setSlate(0, false);

  // --- gaffer by the key light stand
  const gaffer = makeActor({ id: 'GAF', name: '照明部', color: 0x6a5244, skin: 0xe8c4a2, hair: 0x111111, x: keyPos.x - 0.75, z: keyPos.z - 0.35, facingDeg: 110, cap: 0x444444 });
  scene.add(gaffer.group);

  const all = [director, camOp, ac, gaffer];
  const look = { dirMon: new THREE.Vector3(), camMon: new THREE.Vector3(filmCam.position.x + .22, filmCam.position.y + .1, filmCam.position.z + .1), stage: new THREE.Vector3(0, 1.45, 0) };
  dirMonitor.getWorldPosition(look.dirMon);
  const tmp = new THREE.Vector3();
  let clapAnim = 0;

  return {
    director, camOp, ac, gaffer, all, slateGroup: slate,
    directorHead: () => director.headTop.getWorldPosition(tmp).clone(),
    // slate: 'home' | 'in' (walk in, raise) | 'clap' | 'out'
    slate(cmd) {
      if (cmd === 'in') { ac.moveTo({ x: AC_SLATE.x, z: AC_SLATE.z, facingDeg: AC_SLATE.facing, dur: 0.9 }); slateState.up = 1; setSlate(0, true); slateState.open = 0.55; }
      else if (cmd === 'clap') { clapAnim = 1; }
      else if (cmd === 'out') { ac.moveTo({ x: AC_HOME.x, z: AC_HOME.z, facingDeg: AC_HOME.facing, dur: 1.4 }); slateState.up = 0; setSlate(0, false); slateState.open = 0.55; }
    },
    update(dt, t, { directorAmp = 0, acAmp = 0, speakerPos = null, rolling = false } = {}) {
      for (const c of all) c.update(dt);
      director.setMouth(directorAmp); ac.setMouth(acAmp);
      director.idle(t, directorAmp > 0.05, directorAmp > 0.05 ? look.stage : look.dirMon);
      camOp.idle(t, false, rolling ? look.camMon : (speakerPos || look.stage));
      ac.idle(t, false, slateState.up ? null : (speakerPos || look.stage));
      gaffer.idle(t, false, speakerPos || look.stage);
      // clapper stick: open while raised, snaps shut on 'clap'
      if (clapAnim > 0) { clapAnim = Math.max(0, clapAnim - dt * 9); slateState.open = 0.55 * clapAnim; }
      slate.userData.hinge.rotation.z = slateState.up ? slateState.open : 0;
    },
  };
}

function slateTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 104; const x = c.getContext('2d');
  x.fillStyle = '#101010'; x.fillRect(0, 0, 256, 104);
  x.fillStyle = '#f2f2f2'; x.font = '700 30px "Hiragino Sans", system-ui, sans-serif'; x.textBaseline = 'top';
  x.fillText('VR録音道場', 12, 8); x.font = '600 22px system-ui, sans-serif'; x.fillText('SC 3   CUT 1   TK 1', 12, 56);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
