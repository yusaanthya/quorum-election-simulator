// Fur spike: a cast of five coats on one mochi cat (shell fur B, with A kept for comparison),
// under the app's daylight, with the mochi hop.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { U, PATTERNS, catUniforms, coatUniforms, mochiDeform, makeFurNormalMap, makeSurfaceMaterial, makeShellMaterial, makeDecalMaterial, makeShellGeometry, faceMask } from './fur.js';

const SHOW = ['cast row (B)', 'cast row (A)', 'selected: B', 'selected: A | B', 'selected: fur static | fur reacts'];

// The cast. Colours are sRGB hex; whisker colour is per coat so white whiskers never sit on white fur.
// rootDarkness is the colour multiplier at the fur roots (1 = no darkening), baldTint the
// multiplier on the bare skin around the eyes and whiskers, tipRim the rim glow on the tips,
// scatter a soft fill that keeps light fur from going grey in its shadows.
// (The stripes pattern stays in fur.js, unused, for a tabby later.)
const COATS = [
  { name: 'Bombay · coal ball', pattern: 'solid', col0: '#3f3d5c', col1: '#4c4b6d', col2: '#3f3d5c', eyeL: '#f3b831', eyeR: '#f3b831', whisker: '#ebebef', furLength: 0.071, density: 135, seed: 1, rootDarkness: 0.42, baldTint: 0.8, tipRim: 0.8, scatter: 0 },
  { name: 'Odd-eyed white (Turkish Angora)', pattern: 'solid', col0: '#f7f5f2', col1: '#f6e9e9', col2: '#f7f5f2', eyeL: '#f0a42c', eyeR: '#5fb6f0', whisker: '#aaa6ae', furLength: 0.082, density: 140, seed: 2, rootDarkness: 0.9, baldTint: 0.97, tipRim: 0.25, scatter: 0.3 },
  { name: 'Calico', pattern: 'patches', col0: '#f4efe8', col1: '#e0873a', col2: '#2e2a30', eyeL: '#6fbf5a', eyeR: '#6fbf5a', whisker: '#7d7880', furLength: 0.065, density: 140, seed: 3, rootDarkness: 0.75, baldTint: 0.95, tipRim: 0.4, scatter: 0.12 },
  { name: 'Ragdoll colour-point', pattern: 'points', col0: '#f1e6d2', col1: '#5a4036', col2: '#f1e6d2', eyeL: '#4d9be3', eyeR: '#4d9be3', whisker: '#ffffff', furLength: 0.095, density: 120, seed: 4, rootDarkness: 0.65, baldTint: 0.9, tipRim: 0.5, scatter: 0.08 },
  { name: 'British Shorthair blue bicolour', pattern: 'bicolour', col0: '#7d8696', col1: '#f2efea', col2: '#7d8696', eyeL: '#e58a24', eyeR: '#e58a24', whisker: '#86828c', furLength: 0.04, density: 200, seed: 5, rootDarkness: 0.7, baldTint: 0.95, tipRim: 0.5, scatter: 0.1 },
];

// Shared panel state. Fur defaults are the owner's pick (chosen-fur-params.json); fur length and
// density now live on each coat.
const P = {
  shells: 22, strandThickness: 0.46, gravity: 0.43, wind: 0.19, normalStrength: 0.94, normalTilesPerM: 9,
  show: SHOW[0], selected: 1,
  autoHop: true, hopInterval: 1.8, hopHeight: 0.3, squash: 1, wobbleStiffness: 120, wobbleDamping: 6,
  furReacts: false, furInertia: 4, furStiffness: 150,
};
function syncUniforms() {
  U.uShells.value = P.shells; U.uThickness.value = P.strandThickness;
  U.uGravity.value = P.gravity; U.uWind.value = P.wind;
  U.uNormalStrength.value = P.normalStrength; U.uNormalScale.value = P.normalTilesPerM;
}
syncUniforms();

// --- renderer, camera, lights (stage.ts DAYLIGHT + a rim light) ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ece7f3');
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight('#f7f3ff', '#b9b1c9', 1.5));
const key = new THREE.DirectionalLight('#fff2e4', 2.1);
key.position.set(-7, 13, 9);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 40 });
key.shadow.bias = -0.0004;
scene.add(key);
const fill = new THREE.DirectionalLight('#dfe6ff', 0.45);
fill.position.set(9, 5, -4);
scene.add(fill);
const rim = new THREE.DirectionalLight('#e6e0ff', 1.6);
rim.position.set(2, 5, -9);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- load the cat (the committed model, relative to this page) ---
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const file = '../../cat/cat_v2.glb';
const gltf = await loader.loadAsync(file);
const template = gltf.scene;
template.updateMatrixWorld(true);
const body = template.getObjectByName('Body');
const tail = template.getObjectByName('Tail');
const furSrc = body.material;
body.geometry.computeBoundingBox();
const BODY_H = body.geometry.boundingBox.max.y;
body.geometry.computeBoundingSphere();
body.geometry.boundingSphere.radius += 0.3; // squash spreads the base

U.uFurNormal.value = makeFurNormalMap();

// Decal vertices in Body space, for the face mask.
// (A multi-material node such as Eye_L loads as a group of meshes.)
const decals = [];
const toBody = body.matrixWorld.clone().invert();
for (const name of ['Eye_L', 'Eye_R', 'Whiskers_L', 'Whiskers_R']) {
  body.getObjectByName(name).traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, m = toBody.clone().multiply(o.matrixWorld);
    for (let i = 0; i < p.count; i++) decals.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m));
  });
}
body.geometry.setAttribute('furMask', new THREE.BufferAttribute(faceMask(body.geometry, decals), 1));
tail.geometry.setAttribute('furMask', new THREE.BufferAttribute(new Float32Array(tail.geometry.attributes.position.count).fill(1), 1));
const shellGeos = [makeShellGeometry(body.geometry), makeShellGeometry(tail.geometry)];

// Pattern landmarks: ear tips (highest vertex on each side), between the eyes, between the whiskers.
{
  const p = body.geometry.attributes.position, v = new THREE.Vector3();
  U.uEarL.value.set(0, -1, 0); U.uEarR.value.set(0, -1, 0);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ear = v.x > 0 ? U.uEarL.value : U.uEarR.value;
    if (Math.abs(v.x) > 0.1 && v.y > ear.y) ear.copy(v);
  }
  const at = (n) => body.getObjectByName(n).position;
  U.uFace.value.addVectors(at('Eye_L'), at('Eye_R')).multiplyScalar(0.5);
  U.uMuzzle.value.addVectors(at('Whiskers_L'), at('Whiskers_R')).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.06, 0.12));
}

// Tail swing axis: turning about it moves the tail's centre towards -y (tip droops).
tail.geometry.computeBoundingBox();
const tailDir = tail.geometry.boundingBox.getCenter(new THREE.Vector3()).normalize();
const TAIL_AXIS = new THREE.Vector3().crossVectors(tailDir, new THREE.Vector3(0, -1, 0)).normalize();

// --- cats: one coat per cast slot; every cat has its own materials (same programs) ---
const coatU = COATS.map(() => coatUniforms());
const eyeMats = COATS.map(() => ({ L: [], R: [] }));
const whiskerMats = COATS.map(() => []);
const cats = [];
const phases = Array.from({ length: 5 }, () => Math.random());
const DECAL_PARTS = ['Eye_L', 'Eye_R', 'Whiskers_L', 'Whiskers_R'];

function buildCat(group, i) {
  const root = template.clone(true);
  const u = Object.assign(catUniforms(BODY_H), coatU[i]);
  const t = root.getObjectByName('Tail');
  const bodyPart = { ...u, uPartOffset: { value: new THREE.Vector3() }, uIsTail: { value: 0 } };
  const tailPart = { ...u, uPartOffset: { value: t.position.clone() }, uIsTail: { value: 1 } };
  const isA = group === 'A';
  const look = isA ? { tint: { value: 1 }, bald: { value: 1 } } : { tint: coatU[i].uRootDark, bald: coatU[i].uBaldTint };
  const decalMats = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (o.name === 'Body') return (o.material = makeSurfaceMaterial(furSrc, bodyPart, { ...look, deform: 1 }));
    if (o.name === 'Tail') return (o.material = makeSurfaceMaterial(furSrc, tailPart, { ...look, deform: 0 })); // rigid, swings on its pivot
    const part = DECAL_PARTS.find((n) => o.name.startsWith(n) || o.parent.name.startsWith(n));
    // Iris rings get one material per eye (odd eyes), whiskers their own (per-coat tint).
    const keyName = o.material.name === 'M_EyeRing' ? part : part.startsWith('Whiskers') ? 'whisker' : o.material.uuid;
    if (!decalMats.has(keyName)) {
      const m = makeDecalMaterial(o.material, u);
      decalMats.set(keyName, m);
      if (keyName === 'Eye_L') eyeMats[i].L.push(m);
      else if (keyName === 'Eye_R') eyeMats[i].R.push(m);
      else if (keyName === 'whisker') whiskerMats[i].push(m);
    }
    o.material = decalMats.get(keyName);
  });
  if (!isA) {
    root.getObjectByName('Body').add(new THREE.Mesh(shellGeos[0], makeShellMaterial(bodyPart, 1)));
    t.add(new THREE.Mesh(shellGeos[1], makeShellMaterial(tailPart, 0)));
  }
  cats.push({
    group, index: i, root, u, tail: t, tailRest: t.position.clone(), phase: phases[i],
    state: 'idle', nextHop: phases[i] * P.hopInterval, crouchEnd: 0,
    y: 0, v: 0, q: 0, qV: 0, qT: 0, lag: 0, lagV: 0, tailA: 0, tailV: 0, fur: 0, furV: 0, puff: 0, puffV: 0,
  });
  return root;
}

const groups = { A: new THREE.Group(), B: new THREE.Group(), B2: new THREE.Group() };
for (const g of Object.keys(groups)) {
  COATS.forEach((_, i) => groups[g].add(buildCat(g, i)));
  scene.add(groups[g]);
}

function applyCoat(i) {
  const c = COATS[i], u = coatU[i];
  u.uPattern.value = PATTERNS.indexOf(c.pattern);
  u.uCol0.value.set(c.col0); u.uCol1.value.set(c.col1); u.uCol2.value.set(c.col2);
  u.uFurLength.value = c.furLength; u.uDensity.value = c.density; u.uSeed.value = c.seed;
  u.uRootDark.value = c.rootDarkness; u.uBaldTint.value = c.baldTint; u.uRim.value = c.tipRim; u.uScatter.value = c.scatter;
  eyeMats[i].L.forEach((m) => m.color.set(c.eyeL));
  eyeMats[i].R.forEach((m) => m.color.set(c.eyeR));
  whiskerMats[i].forEach((m) => m.color.set(c.whisker));
  labels[i].textContent = c.name;
}

// --- motion: hop cycle, squash spring, top-lag spring, tail spring, fur springs ---
const G = 9.8, KQ = 350, CQ = 17; // squash spring is fixed and snappy; the wobble is the top lag
let simT = 0;
const reacts = (c) => (c.group === 'B2' ? true : P.show === SHOW[4] ? false : P.furReacts);

function spring(c, x, v, k, d, h, target = 0) {
  c[v] += (-k * (c[x] - target) - d * c[v]) * h;
  c[x] += c[v] * h;
}
function startHop(c) {
  if (c.state !== 'idle') return;
  c.state = 'crouch';
  c.crouchEnd = simT + 0.1;
  c.qT = 0.1 * P.squash; // anticipation crouch
}
function step(c, h) {
  if (c.state === 'idle' && P.autoHop && simT >= c.nextHop) startHop(c);
  if (c.state === 'crouch' && simT >= c.crouchEnd) {
    c.state = 'push'; // stretch up while the base is still on the ground
    c.qT = -0.16 * P.squash;
  }
  if (c.state === 'push' && simT >= c.crouchEnd + 0.06) {
    const v0 = Math.sqrt(2 * G * P.hopHeight);
    c.state = 'air'; c.v = v0; c.qT = 0;
    c.qV -= v0 * P.squash; // keep stretching through takeoff
    c.lagV += v0 * 0.17 * P.squash; // top leads
    c.tailV += v0 * 0.8;
  }
  const vTop0 = c.v + c.lagV;
  if (c.state === 'air') {
    c.v -= G * h;
    c.y += c.v * h;
    if (c.y <= 0) {
      const impact = -c.v;
      c.y = 0; c.v = 0; c.state = 'idle'; c.nextHop = simT + P.hopInterval;
      c.qV += impact * 1.9 * P.squash; // base spreads, top flattens
      c.lagV -= impact * 0.34 * P.squash; // top keeps falling, then wobbles back
      c.tailV += impact * 0.8;
    }
  }
  spring(c, 'q', 'qV', KQ, CQ, h, c.qT);
  spring(c, 'lag', 'lagV', P.wobbleStiffness, P.wobbleDamping, h);
  spring(c, 'tailA', 'tailV', P.wobbleStiffness * 0.6, P.wobbleDamping * 0.6, h);
  if (reacts(c)) {
    // Fur tips feel the top's acceleration (incl. weightlessness in the air) and settle on their own spring.
    const dv = c.v + c.lagV - vTop0, cf = 0.5 * Math.sqrt(P.furStiffness);
    c.furV -= P.furInertia * dv;
    if (vTop0 < 0 && dv > 0) c.puffV += P.furInertia * dv; // braking a fall: puff
    spring(c, 'fur', 'furV', P.furStiffness, cf, h);
    spring(c, 'puff', 'puffV', P.furStiffness, cf, h);
  } else c.fur = c.furV = c.puff = c.puffV = 0;
}

const tmp = new THREE.Vector3();
function simulate(dt) {
  const n = Math.ceil(dt * 240), h = dt / n;
  for (let i = 0; i < n; i++) {
    simT += h;
    for (const c of cats) step(c, h);
  }
  U.uTime.value = simT;
  for (const c of cats) {
    const q = THREE.MathUtils.clamp(c.q, -0.4, 0.5) + 0.012 * Math.sin(simT * 1.8 + c.phase * 6.28); // + idle breathe
    c.u.uSquash.value = q;
    c.u.uLag.value = c.lag;
    c.u.uFurTrail.value = c.fur;
    c.u.uFurPuff.value = c.puff;
    c.root.position.y = c.y;
    // The tail pivot rides the deformed surface; the tail itself swings on its own spring.
    c.tail.position.copy(c.tailRest).add(mochiDeform(c.tailRest, q, c.lag, BODY_H, tmp));
    c.tail.quaternion.setFromAxisAngle(TAIL_AXIS, c.tailA);
  }
}
// Like the app, every cat turns to face the camera (about y only).
function faceCamera() {
  for (const c of cats) {
    if (!c.root.visible || !c.root.parent.visible) continue;
    c.root.parent.updateWorldMatrix(true, false);
    c.root.getWorldPosition(tmp);
    if (spike.faceCam) c.root.rotation.y = Math.atan2(camera.position.x - tmp.x, camera.position.z - tmp.z);
    c.root.updateWorldMatrix(false, false);
    c.u.uCatInv.value.copy(c.root.matrixWorld).invert();
  }
}
const hopAll = () => cats.forEach(startHop);

// --- layout and labels ---
const tagL = document.getElementById('tagA'), tagR = document.getElementById('tagB');
const labels = COATS.map(() => document.body.appendChild(Object.assign(document.createElement('div'), { className: 'label' })));
const row = () => P.show.startsWith('cast row');
// Close: the app's "lineup" theme spacing (scenery/lineup.ts). App distance: the default
// "academy" circle (scenery/academy.ts, r = 3.7 for five) seen by the home camera (stage.ts).
let appView = false;
const lineupAt = (i, n) => { const x = (i - (n - 1) / 2) * 1.35; return [x, -Math.abs(x) * 0.12]; };
const circleAt = (i, n) => { const a = Math.atan2(11, 15.5) + (i / n) * Math.PI * 2; return [Math.sin(a) * 3.7, Math.cos(a) * 3.7]; };

function layout() {
  const sel = P.selected - 1;
  const vis = { A: P.show === SHOW[1] || P.show === SHOW[3], B: P.show !== SHOW[1], B2: P.show === SHOW[4] };
  const pair = P.show === SHOW[3] || P.show === SHOW[4];
  const x = { A: pair ? -0.8 : 0, B: pair && P.show === SHOW[4] ? -0.8 : pair ? 0.8 : 0, B2: 0.8 };
  for (const g of Object.keys(groups)) {
    groups[g].visible = vis[g];
    groups[g].position.x = row() ? 0 : x[g];
    groups[g].children.forEach((r, i) => {
      r.visible = row() || i === sel;
      const [px, pz] = !row() ? [0, 0] : appView ? circleAt(i, COATS.length) : lineupAt(i, COATS.length);
      r.position.set(px, r.position.y, pz);
    });
  }
  labels.forEach((l) => (l.style.display = row() ? '' : 'none'));
  const name = COATS[sel].name;
  tagL.style.display = pair ? '' : 'none';
  tagR.style.display = row() ? 'none' : '';
  tagR.style.left = pair ? '75%' : '50%';
  tagL.textContent = P.show === SHOW[4] ? `${name} · fur static` : `${name} · A normal map`;
  tagR.textContent = P.show === SHOW[4] ? `${name} · fur reacts` : `${name} · B shells${P.furReacts ? ' · fur reacts' : ''}`;
  if (row() && appView) camera.position.set(11, 11.5, 15.5), controls.target.set(0, 0.2, 0);
  else if (row()) camera.position.set(0.7, 2.6, 9.2), controls.target.set(0.7, 0.6, 0); // lineup camera, nudged clear of the panel
  else if (pair) camera.position.set(0.3, 1.4, 6), controls.target.set(0.3, 0.6, 0);
  else camera.position.set(0, 1.3, 4.5), controls.target.set(0, 0.6, 0);
  controls.update();
}
/** Stand the cast the way the app does and frame it with the app's home camera (fov 28). */
function setView(app) {
  appView = app;
  if (!row()) (P.show = SHOW[0]), gui.controllersRecursive().forEach((c) => c.updateDisplay());
  layout();
}
const appDistance = () => setView(true);
const proj = new THREE.Vector3();
function placeLabels() {
  if (!row()) return;
  const g = groups[P.show === SHOW[1] ? 'A' : 'B'];
  g.children.forEach((r, i) => {
    proj.set(r.position.x, -0.08, r.position.z).applyMatrix4(g.matrixWorld).project(camera);
    Object.assign(labels[i].style, { left: `${(proj.x * 0.5 + 0.5) * innerWidth}px`, top: `${(-proj.y * 0.5 + 0.5) * innerHeight}px` });
  });
}

// --- GUI ---
const json = document.getElementById('json');
const exportJson = () => JSON.stringify({ shared: P, cats: COATS }, null, 1);
const dump = () => (json.value = exportJson());
const gui = new GUI({ title: 'fur spike' });
gui.onChange(() => { syncUniforms(); dump(); });
const fv = gui.addFolder('view');
fv.add(P, 'show', SHOW).onChange(layout);
fv.add({ appDistance }, 'appDistance').name('camera: app distance');
fv.add({ close: () => setView(false) }, 'close').name('camera: close');
const fk = gui.addFolder('coat of selected cat');
fk.add(P, 'selected', [1, 2, 3, 4, 5]).name('cat').onChange(() => { buildCoatPanel(); layout(); });
let coatCtrls = [];
function buildCoatPanel() {
  coatCtrls.forEach((c) => c.destroy());
  const i = P.selected - 1, c = COATS[i], on = () => applyCoat(i);
  coatCtrls = [
    fk.add(c, 'name').onChange(on),
    fk.add(c, 'pattern', PATTERNS).onChange(on),
    fk.addColor(c, 'col0').name('colour 1 (base)').onChange(on),
    fk.addColor(c, 'col1').name('colour 2').onChange(on),
    fk.addColor(c, 'col2').name('colour 3').onChange(on),
    fk.addColor(c, 'eyeL').name('left eye').onChange(on),
    fk.addColor(c, 'eyeR').name('right eye').onChange(on),
    fk.addColor(c, 'whisker').onChange(on),
    fk.add(c, 'furLength', 0.005, 0.14, 0.001).name('fur length (m)').onChange(on),
    fk.add(c, 'density', 40, 400, 1).name('density (/m)').onChange(on),
    fk.add(c, 'seed', 0, 100, 1).onChange(on),
    fk.add(c, 'rootDarkness', 0, 1, 0.01).name('root darkness (1 = none)').onChange(on),
    fk.add(c, 'baldTint', 0, 1.2, 0.01).name('bald patch tint').onChange(on),
    fk.add(c, 'tipRim', 0, 2, 0.01).name('tip rim').onChange(on),
    fk.add(c, 'scatter', 0, 0.6, 0.01).name('scatter (soft fill)').onChange(on),
  ];
}
const fm = gui.addFolder('motion');
fm.add({ hop: hopAll }, 'hop').name('hop!');
fm.add(P, 'autoHop').name('auto hop').onChange((on) => on && cats.forEach((c) => (c.nextHop = simT + c.phase * P.hopInterval)));
fm.add(P, 'hopInterval', 0.6, 5, 0.1).name('auto-hop interval (s)');
fm.add(P, 'hopHeight', 0.05, 0.8, 0.01).name('hop height (m)');
fm.add(P, 'squash', 0, 2, 0.01).name('squash amount');
fm.add(P, 'wobbleStiffness', 20, 400, 1).name('wobble stiffness');
fm.add(P, 'wobbleDamping', 0.5, 30, 0.1).name('wobble damping');
fm.add(P, 'furReacts').name('fur reacts').onChange(layout);
fm.add(P, 'furInertia', 0, 6, 0.05).name('fur inertia');
fm.add(P, 'furStiffness', 20, 600, 1).name('fur spring stiffness');
const fb = gui.addFolder('B: shells (shared)');
fb.add(P, 'shells', 4, 32, 1).onChange((n) => shellGeos.forEach((g) => (g.instanceCount = n)));
fb.add(P, 'strandThickness', 0.1, 0.6, 0.01).name('strand thickness');
fb.add(P, 'gravity', 0, 1.5, 0.01);
fb.add(P, 'wind', 0, 1, 0.01);
const fa = gui.addFolder('A: surface (also B base)');
fa.add(P, 'normalStrength', 0, 2, 0.01).name('normal strength');
fa.add(P, 'normalTilesPerM', 2, 30, 0.1).name('tiles / m');
[fm, fb, fa].forEach((f) => f.close());
gui.add({ copy() {
  dump();
  json.select();
  navigator.clipboard?.writeText(json.value).then(() => (json.title = 'copied'), () => (json.title = 'clipboard failed: copy from here'));
} }, 'copy').name('copy settings');

// --- stats ---
const stats = document.getElementById('stats');
let frames = 0, acc = 0, last = performance.now();
function report() {
  const { calls, triangles } = renderer.info.render;
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  stats.textContent = `${(frames / acc * 1000).toFixed(0)} fps · ${(acc / frames).toFixed(1)} ms\n` +
    `${calls} draw calls · ${triangles.toLocaleString()} tris\n${s.x}×${s.y} px · ${file.slice(3)}`;
  frames = acc = 0;
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
COATS.forEach((_, i) => applyCoat(i));
buildCoatPanel();
layout();
dump();

// Test hook for headless frame capture: pause the clock and step it by hand.
const spike = (window.spike = {
  P, COATS, cats, hopAll, layout, appDistance, camera, controls, paused: false, faceCam: true,
  select: (k) => { P.selected = k; buildCoatPanel(); layout(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); }, get t() { return simT; },
  advance: (sec) => { for (let t = 0; t < sec - 1e-6; t += 1 / 120) simulate(1 / 120); },
});

renderer.setAnimationLoop(() => {
  const now = performance.now();
  acc += now - last; frames++;
  if (!spike.paused) simulate(Math.min((now - last) / 1000, 1 / 20));
  last = now;
  controls.update();
  faceCamera();
  renderer.render(scene, camera);
  placeLabels();
  if (acc > 500) report();
});
