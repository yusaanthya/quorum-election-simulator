import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Motes, Sigil } from "../scene/magic";
import { roundedCylinder } from "../scene/shapes";
import { ball, matte, place, roundedBox, type Theme } from "./kit";
import { mulberry32 } from "../scene/random";

const STONE = "#48362d";
const STONE_LIGHT = "#4d3b32";
const SEAM = "#44332a";
const WOOD = "#39251c";
const BOOKS = ["#322a2e", "#432825", "#353124", "#4a3523", "#3b292f", "#462e22"];

// Camera looks from +x/+z, so "behind the circle" is the opposite direction.
const BACK = Math.atan2(15.5, 11) + Math.PI;
/** The same camera direction as an angle from +z toward +x, the way members are placed. */
const FRONT = Math.atan2(11, 15.5);

// Members stand on the upper dais (flat to radius 5.18) between the rune circle (2.3) and the
// bookshelves (5.45), each with a floor sigil of radius 1.05. The ring widens with the cluster
// so nine members keep 0.7 between their sigils, and stays clear of the rune circle for one.
const STAND_MIN = 3.5;
const STAND_MAX = 4.1;
const standRadius = (n: number) => Math.min(STAND_MAX, STAND_MIN + Math.max(0, n - 3) * 0.1);

const sigils: Sigil[] = [];
const motes: Motes[] = [];
const floaters: { obj: THREE.Object3D; y: number; phase: number }[] = [];

/** Concept A: a magic academy's round council hall with a rune circle and bookshelves. */
export const academy: Theme = {
  id: "academy",
  title: "A · 魔法學院的星詠圓桌",
  background: ["#2b1c30", "#150d1c", "#050308"],
  lighting: {
    hemi: { sky: "#ffd6ad", ground: "#1a0f18", intensity: 0.55 },
    key: { color: "#ffb478", intensity: 0.9 },
    fill: { color: "#5d3c86", intensity: 0.3 },
    exposure: 1.0,
  },
  bloom: 0.8,
  memberLook: { lampHeight: 1.4, lampIntensity: 2, sigilGlow: 2.2, sigilInk: 0 },
  standRadius: STAND_MAX,
  // An odd cluster puts member 0 nearest the camera. An even one turns half a step, so it is
  // symmetric too, two members stand left and right rather than front and back, and nobody
  // stands straight behind the crystal.
  layout(i, n) {
    const r = standRadius(n);
    const a = FRONT + ((i + (n % 2 === 0 ? 0.5 : 0)) / n) * Math.PI * 2;
    return [Math.sin(a) * r, Math.cos(a) * r];
  },
  // Members facing each other across the circle would send messages straight through the crystal.
  keepClear: 0.6,

  build(scene) {
    const rand = mulberry32(11);
    // Two-tier stone dais.
    place(scene, new THREE.Mesh(roundedCylinder(6.5, 0.6, 0.26, 96), matte(STONE)), 0, -0.62);
    place(scene, new THREE.Mesh(roundedCylinder(5.3, 0.32, 0.12, 96), matte(STONE_LIGHT)), 0, -0.16);
    for (const r of [2.45, 3.5, 4.7]) {
      const seam = new THREE.Mesh(new THREE.RingGeometry(r - 0.02, r + 0.02, 96), matte(SEAM));
      seam.rotation.x = -Math.PI / 2;
      place(scene, seam, 0, 0.003, 0, false);
    }

    // Ornate rune circle of gold and silver light, glowing on the dark stone.
    const sigil = new Sigil(2.2, { scheme: "dawn", points: 6, seed: 3, glow: 2.0 });
    place(scene, sigil, 0, 0.022, 0, false);
    sigils.push(sigil);
    // The circle also lights the members standing around it.
    const circleLight = new THREE.PointLight("#ffb25a", 16, 9, 1.6);
    circleLight.position.set(0, 0.7, 0);
    scene.add(circleLight);
    const dust = new Motes(2.1, 2.4, 48);
    place(scene, dust, 0, 0.05, 0, false);
    motes.push(dust);

    // A soft pool of light under the lines, then a crystal floating over the compass rose.
    const aura = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 64),
      new THREE.MeshBasicMaterial({ map: auraTexture(), color: "#ffcf7e", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    aura.rotation.x = -Math.PI / 2;
    aura.renderOrder = 1;
    place(scene, aura, 0, 0.018, 0, false);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), matte("#cdbff2", 0.35));
    crystal.scale.y = 1.7;
    place(scene, crystal, 0, 1.1);
    floaters.push({ obj: crystal, y: 1.1, phase: 0 });

    // Bookshelves curving around the back of the hall. They never move, so every part of every
    // shelf is baked into one vertex-colored mesh: one draw call instead of about 240.
    const units = 7;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < units; i++) {
      const a = BACK + ((i - (units - 1) / 2) / units) * 2.1;
      const at = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * 5.85, -0.32, Math.sin(a) * 5.85),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2),
        new THREE.Vector3(1, 1, 1),
      );
      parts.push(...bookshelf(rand, at));
    }
    const shelves = mergeGeometries(parts)!;
    for (const p of parts) p.dispose();
    place(scene, new THREE.Mesh(shelves, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })));

    // Floating candles.
    for (let i = 0; i < 7; i++) {
      const a = BACK + (rand() - 0.5) * 3.4;
      const r = 3 + rand() * 2;
      const candle = new THREE.Group();
      candle.add(new THREE.Mesh(roundedCylinder(0.07, 0.32, 0.03, 16), matte("#4f3d33")));
      const flame = ball("#ffdca3", 0.06, 1.4);
      flame.scale.y = 0.09;
      flame.position.y = 0.24;
      const y = 2.3 + rand() * 1.1;
      place(scene, candle, Math.cos(a) * r, y, Math.sin(a) * r);
      // Added after place() so the glowing flame stays out of the shadow map.
      candle.add(flame);
      floaters.push({ obj: candle, y, phase: rand() * 6 });
    }
    return 6.5;
  },

  animate(t) {
    for (const s of sigils) s.spin(t);
    for (const m of motes) m.update(t);
    for (const f of floaters) {
      f.obj.position.y = f.y + Math.sin(t * 1.2 + f.phase) * 0.08;
      if (f.phase === 0) f.obj.rotation.y = t * 0.6;
    }
  },
};

/** One bookshelf's parts, each colored and moved into place by `at`, ready to merge. */
function bookshelf(rand: () => number, at: THREE.Matrix4) {
  const parts: THREE.BufferGeometry[] = [];
  const part = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, lean = 0) => {
    geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(lean).setPosition(x, y, z).premultiply(at));
    const c = new THREE.Color(color);
    const n = geo.getAttribute("position").count;
    const rgb = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) c.toArray(rgb, v * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    parts.push(geo);
  };
  const w = 1.5;
  const h = 2.5;
  const d = 0.42;
  part(roundedBox(w, h, d, 0.08), WOOD, 0, h / 2, 0);
  // Recess for the shelves, slightly lighter.
  part(roundedBox(w - 0.18, h - 0.22, 0.05, 0.02), "#332017", 0, h / 2, d / 2 - 0.02);
  for (let row = 0; row < 3; row++) {
    const y = 0.22 + row * 0.75;
    part(roundedBox(w - 0.16, 0.06, 0.32, 0.02), WOOD, 0, y, d / 2 + 0.04);
    let x = -w / 2 + 0.16;
    while (x < w / 2 - 0.2) {
      const bw = 0.08 + rand() * 0.06;
      const bh = 0.36 + rand() * 0.22;
      const color = BOOKS[Math.floor(rand() * BOOKS.length)];
      const lean = rand() < 0.12 ? 0.2 : 0;
      part(roundedBox(bw, bh, 0.26, 0.02), color, x + bw / 2, y + 0.03 + bh / 2, d / 2 + 0.06, lean);
      x += bw + 0.012 + (lean ? 0.06 : 0);
    }
  }
  return parts;
}

function auraTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(0.8, "rgba(255,255,255,0.15)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
