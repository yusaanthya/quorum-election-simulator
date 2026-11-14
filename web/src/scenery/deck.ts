import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { palette } from "../scene/palette";
import { roundedCylinder } from "../scene/shapes";
import { mulberry32 } from "./random";

/** Radius of the wooden deck the members stand on. */
export const DECK_RADIUS = 5;
const BASE_RADIUS = 6.3;
const DECK_TOP = 0;

/** A wooden deck on a rounded stand, ringed with grass and pebbles. Returns its outer radius. */
export function buildDeckIsland(scene: THREE.Scene): number {
  const matte = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });

  // Rounded base, a little wider than the deck, like a display stand.
  const base = new THREE.Mesh(roundedCylinder(BASE_RADIUS, 0.8, 0.32, 96), matte(palette.base));
  base.position.y = DECK_TOP - 0.22 - 0.4;
  base.receiveShadow = true;
  scene.add(base);

  const baseTop = new THREE.Mesh(new THREE.CircleGeometry(BASE_RADIUS - 0.3, 96), matte(palette.baseTop));
  baseTop.rotation.x = -Math.PI / 2;
  baseTop.position.y = DECK_TOP - 0.219;
  baseTop.receiveShadow = true;
  scene.add(baseTop);

  // Wooden deck: rounded planks cut to a circle.
  const plankW = 0.72;
  const count = Math.floor((DECK_RADIUS * 2) / plankW);
  const start = -((count - 1) * plankW) / 2;
  const woodMats = palette.wood.map(matte);
  for (let i = 0; i < count; i++) {
    const x = start + i * plankW;
    const edge = Math.abs(x) + plankW / 2;
    const len = 2 * Math.sqrt(Math.max(0, DECK_RADIUS * DECK_RADIUS - edge * edge)) + 0.4;
    if (len < 1) continue;
    const plank = new THREE.Mesh(new RoundedBoxGeometry(plankW - 0.06, 0.22, len, 3, 0.07), woodMats[i % woodMats.length]);
    plank.position.set(x, DECK_TOP - 0.11, ((i * 37) % 5) * 0.03 - 0.06);
    plank.castShadow = true;
    plank.receiveShadow = true;
    scene.add(plank);
  }

  // A round rug in the middle where messages cross.
  const border = new THREE.Mesh(roundedCylinder(1.75, 0.035, 0.015), matte(palette.rugBorder));
  border.position.y = DECK_TOP + 0.018;
  border.receiveShadow = true;
  scene.add(border);
  const rug = new THREE.Mesh(roundedCylinder(1.55, 0.045, 0.02), matte(palette.rug));
  rug.position.y = DECK_TOP + 0.024;
  rug.receiveShadow = true;
  scene.add(rug);

  addGreenery(scene, matte);
  return BASE_RADIUS;
}

function addGreenery(scene: THREE.Scene, matte: (color: string) => THREE.MeshStandardMaterial) {
  const rand = mulberry32(7);
  const blade = new THREE.CapsuleGeometry(0.07, 0.4, 4, 10);
  const grassMats = palette.grass.map(matte);
  const stone = new THREE.SphereGeometry(1, 20, 14);
  const stoneMat = matte(palette.stone);
  const ringY = DECK_TOP - 0.22;

  // Grass tufts in clusters around the edge of the base.
  for (let c = 0; c < 14; c++) {
    const a = (c / 14) * Math.PI * 2 + rand() * 0.25;
    const r = DECK_RADIUS + 0.55 + rand() * 0.35;
    const tuft = new THREE.Group();
    const blades = 3 + Math.floor(rand() * 3);
    for (let b = 0; b < blades; b++) {
      const m = new THREE.Mesh(blade, grassMats[Math.floor(rand() * grassMats.length)]);
      const h = 0.6 + rand() * 0.7;
      m.scale.set(1, h, 0.7);
      m.position.set((rand() - 0.5) * 0.3, 0.24 * h, (rand() - 0.5) * 0.3);
      m.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.6);
      m.castShadow = true;
      tuft.add(m);
    }
    tuft.position.set(Math.cos(a) * r, ringY, Math.sin(a) * r);
    scene.add(tuft);
  }

  // Smooth pebbles, some in small groups.
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const r = DECK_RADIUS + 0.45 + rand() * 0.6;
    const p = new THREE.Mesh(stone, stoneMat);
    const size = 0.1 + rand() * 0.16;
    p.scale.set(size * (1 + rand() * 0.5), size * 0.45, size);
    p.rotation.y = rand() * Math.PI;
    p.position.set(Math.cos(a) * r, ringY + size * 0.2, Math.sin(a) * r);
    p.castShadow = true;
    p.receiveShadow = true;
    scene.add(p);
  }
}
