import * as THREE from "three";
import { Motes, Sigil } from "../scene/magic";
import { roundedCylinder } from "../scene/shapes";
import { ball, matte, place, roundedBox, type Theme } from "./kit";
import { mulberry32 } from "./random";

const STONE = "#ddd5c9";
const STONE_LIGHT = "#ece6dc";
const SEAM = "#d3cabd";
const WOOD = "#b59b8a";
const BOOKS = ["#a3abcb", "#cfa7ab", "#abc4a8", "#e3d1a5", "#bba9d1", "#d9b9a0"];

// Camera looks from +x/+z, so "behind the circle" is the opposite direction.
const BACK = Math.atan2(15.5, 11) + Math.PI;

const sigils: Sigil[] = [];
const motes: Motes[] = [];
const floaters: { obj: THREE.Object3D; y: number; phase: number }[] = [];

/** Concept A: a magic academy's round council hall with a rune circle and bookshelves. */
export const academy: Theme = {
  id: "academy",
  title: "A · 魔法學院的星詠圓桌",
  background: ["#ece7f3", "#cec5df", "#a69bc2"],
  standRadius: 3.9,

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

    // Ornate rune circle of gold and silver light, straight on the pale stone.
    const sigil = new Sigil(2.2, { scheme: "dawn", points: 6, seed: 3, glow: 1.1, ink: 1 });
    place(scene, sigil, 0, 0.022, 0, false);
    sigils.push(sigil);
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

    // Bookshelves curving around the back of the hall.
    const units = 7;
    for (let i = 0; i < units; i++) {
      const a = BACK + ((i - (units - 1) / 2) / units) * 2.1;
      const shelf = bookshelf(rand);
      shelf.rotation.y = -a - Math.PI / 2;
      place(scene, shelf, Math.cos(a) * 5.85, -0.32, Math.sin(a) * 5.85);
    }

    // Floating candles.
    for (let i = 0; i < 7; i++) {
      const a = BACK + (rand() - 0.5) * 3.4;
      const r = 3 + rand() * 2;
      const candle = new THREE.Group();
      candle.add(new THREE.Mesh(roundedCylinder(0.07, 0.32, 0.03, 16), matte("#f2ece0")));
      const flame = ball("#ffdca3", 0.06, 1.4);
      flame.scale.y = 0.09;
      flame.position.y = 0.24;
      candle.add(flame);
      const y = 2.3 + rand() * 1.1;
      place(scene, candle, Math.cos(a) * r, y, Math.sin(a) * r);
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

function bookshelf(rand: () => number) {
  const g = new THREE.Group();
  const w = 1.5;
  const h = 2.5;
  const d = 0.42;
  const frame = new THREE.Mesh(roundedBox(w, h, d, 0.08), matte(WOOD));
  frame.position.y = h / 2;
  g.add(frame);
  // Recess for the shelves, slightly lighter.
  const back = new THREE.Mesh(roundedBox(w - 0.18, h - 0.22, 0.05, 0.02), matte("#a48a7a"));
  back.position.set(0, h / 2, d / 2 - 0.02);
  g.add(back);
  for (let row = 0; row < 3; row++) {
    const y = 0.22 + row * 0.75;
    const board = new THREE.Mesh(roundedBox(w - 0.16, 0.06, 0.32, 0.02), matte(WOOD));
    board.position.set(0, y, d / 2 + 0.04);
    g.add(board);
    let x = -w / 2 + 0.16;
    while (x < w / 2 - 0.2) {
      const bw = 0.08 + rand() * 0.06;
      const bh = 0.36 + rand() * 0.22;
      const book = new THREE.Mesh(roundedBox(bw, bh, 0.26, 0.02), matte(BOOKS[Math.floor(rand() * BOOKS.length)]));
      const lean = rand() < 0.12 ? 0.2 : 0;
      book.position.set(x + bw / 2, y + 0.03 + bh / 2, d / 2 + 0.06);
      book.rotation.z = lean;
      g.add(book);
      x += bw + 0.012 + (lean ? 0.06 : 0);
    }
  }
  return g;
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
