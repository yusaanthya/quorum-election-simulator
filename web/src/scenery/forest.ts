import * as THREE from "three";
import { Sigil } from "../scene/magic";
import { roundedCylinder } from "../scene/shapes";
import { arc, ball, grassRing, lathe, matte, place, puff, roundedBox, type Theme } from "./kit";
import { mulberry32 } from "../scene/random";

const EARTH = "#c9ae95";
const MOSS = "#b4cda3";
const CLEARING = "#e6dac5";
const LEAVES = ["#b4d0a6", "#a3c497", "#c5dcb6"];
const BARK = "#ae927c";
const CAP = "#dca7a2";
const CREAM = "#f0e8da";

const BACK = Math.atan2(15.5, 11) + Math.PI;

const fireflies: { obj: THREE.Object3D; base: THREE.Vector3; phase: number }[] = [];
const sigils: Sigil[] = [];

/** Concept B: a mossy glade in a forest-spirit village, with mushroom cottages and fireflies. */
export const forest: Theme = {
  id: "forest",
  title: "B · 森之精靈的林間集會",
  background: ["#eef1e8", "#d2dcca", "#aab9a2"],
  standRadius: 3.8,

  build(scene) {
    const rand = mulberry32(23);
    // Island: rounded earth underside with a mossy top.
    const body = lathe([[0, -2.4], ...arc(0.6, -2.4, 0.6, -Math.PI / 2, 0, 4), [3.6, -1.2], [5.9, -0.55], ...arc(5.9, -0.3, 0.25, -Math.PI / 2, Math.PI / 2, 6), [0, -0.05]], 96);
    place(scene, new THREE.Mesh(body, matte(EARTH)), 0, -0.1);
    place(scene, new THREE.Mesh(roundedCylinder(6.05, 0.26, 0.13, 96), matte(MOSS)), 0, -0.13);
    const clearing = new THREE.Mesh(roundedCylinder(2.2, 0.04, 0.02, 64), matte(CLEARING));
    place(scene, clearing, 0, 0.0);
    const ring = new Sigil(2.05, { scheme: "sun", points: 6, seed: 2, ink: 0.6 });
    place(scene, ring, 0, 0.03, 0, false);
    sigils.push(ring);

    // Stepping stones winding toward the front.
    for (let i = 0; i < 6; i++) {
      const a = BACK + Math.PI + (i - 2.5) * 0.12;
      const r = 2.5 + i * 0.55;
      const s = new THREE.Mesh(roundedCylinder(0.26 + rand() * 0.08, 0.08, 0.04, 24), matte("#e9e6df"));
      s.scale.z = 0.8;
      place(scene, s, Math.cos(a) * r, 0.02, Math.sin(a) * r);
    }

    // A big round tree behind the circle.
    const tree = new THREE.Group();
    tree.add(new THREE.Mesh(lathe([[0, 0], [0.62, 0], ...arc(0.62, 0.15, 0.15, -Math.PI / 2, 0, 3), [0.4, 0.8], [0.32, 2.4], [0, 2.4]]), matte(BARK)));
    const crown = puff(LEAVES[1], 1.0, rand, 6);
    crown.position.y = 2.55;
    tree.add(crown);
    const crown2 = puff(LEAVES[0], 0.62, rand, 4);
    crown2.position.set(0.75, 2.05, 0.35);
    tree.add(crown2);
    tree.scale.setScalar(0.85);
    place(scene, tree, Math.cos(BACK) * 4.9, 0, Math.sin(BACK) * 4.9);

    // Two mushroom cottages on either side of the tree.
    for (const [offset, scale] of [[-0.75, 1], [0.8, 0.8]] as const) {
      const a = BACK + offset;
      const house = mushroomHouse(rand);
      house.scale.setScalar(scale);
      house.rotation.y = -a - Math.PI / 2;
      place(scene, house, Math.cos(a) * 4.8, 0, Math.sin(a) * 4.8);
    }

    // Bushes, flowers and grass around the rim.
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - BACK), Math.cos(a - BACK))) > 2.3) continue; // Keep the front open
      const b = puff(LEAVES[i % 3], 0.38 + rand() * 0.2, rand, 4);
      place(scene, b, Math.cos(a) * 5.4, 0.15, Math.sin(a) * 5.4);
    }
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = 4.6 + rand() * 1.2;
      const f = ball(["#f2dce0", "#f6efe3", "#e8c9d6", "#f3e3b5"][i % 4], 0.07);
      place(scene, f, Math.cos(a) * r, 0.12, Math.sin(a) * r);
    }
    grassRing(scene, rand, { inner: 4.7, outer: 5.9, y: 0, clusters: 22, colors: LEAVES });

    // Fireflies drifting over the glade.
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2;
      const r = 1 + rand() * 4.5;
      const fly = ball("#f5e3a3", 0.045, 1.6);
      const base = new THREE.Vector3(Math.cos(a) * r, 0.8 + rand() * 2.2, Math.sin(a) * r);
      place(scene, fly, base.x, base.y, base.z, false);
      fireflies.push({ obj: fly, base, phase: rand() * 10 });
    }
    return 6.1;
  },

  animate(t) {
    for (const s of sigils) s.spin(t, 0.7);
    for (const f of fireflies) {
      f.obj.position.set(
        f.base.x + Math.sin(t * 0.5 + f.phase) * 0.35,
        f.base.y + Math.sin(t * 0.9 + f.phase * 2) * 0.2,
        f.base.z + Math.cos(t * 0.4 + f.phase) * 0.35,
      );
      f.obj.scale.setScalar(0.045 * (0.6 + 0.4 * Math.sin(t * 2.2 + f.phase)));
    }
  },
};

function mushroomHouse(rand: () => number) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(lathe([[0, 0], [0.62, 0], ...arc(0.62, 0.08, 0.08, -Math.PI / 2, 0, 3), [0.66, 0.6], [0.56, 1.25], [0, 1.25]]), matte(CREAM)));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), matte(CAP));
  cap.scale.set(1.05, 0.8, 1.05);
  cap.position.y = 1.15;
  g.add(cap);
  const gills = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), matte(CREAM));
  gills.rotation.x = Math.PI / 2;
  gills.position.y = 1.15;
  g.add(gills);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.07, 10, 48), matte(CAP));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.16;
  g.add(rim);
  for (let i = 0; i < 7; i++) {
    const az = rand() * Math.PI * 2;
    const el = 0.35 + rand() * 0.8; // Elevation above the rim
    const n = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.1 + rand() * 0.06, 20), matte(CREAM));
    spot.position.set(n.x * 1.06, 1.15 + n.y * 0.81, n.z * 1.06);
    spot.lookAt(spot.position.clone().add(n));
    g.add(spot);
  }
  const door = new THREE.Mesh(roundedBox(0.36, 0.6, 0.08, 0.1), matte("#b8967d"));
  door.position.set(0, 0.32, 0.6);
  g.add(door);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), matte("#f6e3b0", 0.6));
  win.position.set(0.32, 0.85, 0.55);
  win.rotation.y = 0.5;
  g.add(win);
  return g;
}
