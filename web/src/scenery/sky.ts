import * as THREE from "three";
import { Sigil } from "../scene/magic";
import { mochiGeometry, roundedCylinder } from "../scene/shapes";
import { arc, ball, grassRing, lathe, matte, place, puff, roundedBox, type Theme } from "./kit";
import { mulberry32 } from "./random";

const STONE = "#ebe5db";
const STONE_SIDE = "#d8d0c4";
const EARTH = "#cdb7a1";
const GRASS = ["#b3cfa6", "#a1c396", "#c2d9b3"];
const EMBLEM = "#9fbfc4";
const BANNER = "#e1aa9b";
const DRAGON = "#a8cbc8";
const DRAGON_BELLY = "#e9e1cf";

const BACK = Math.atan2(15.5, 11) + Math.PI;

const clouds: { obj: THREE.Object3D; x: number; phase: number }[] = [];
const dragonParts: { breathe?: THREE.Object3D } = {};
const sigils: Sigil[] = [];

/** Concept C: a floating sky island with a ring of pillars and a sleeping guardian dragon. */
export const sky: Theme = {
  id: "sky",
  title: "C · 天空浮島的龍之祭壇",
  background: ["#f1f5fa", "#d3e1ef", "#a8c0db"],
  standRadius: 3.8,

  build(scene) {
    const rand = mulberry32(5);
    // Floating island: stone plaza on a rounded, tapering earth base.
    const under = lathe([[0, -3.6], ...arc(0.5, -3.6, 0.5, -Math.PI / 2, 0, 4), [2.2, -2.4], [4.8, -1.2], [5.9, -0.55], ...arc(5.9, -0.4, 0.15, -Math.PI / 2, Math.PI / 2, 4), [0, -0.25]], 96);
    place(scene, new THREE.Mesh(under, matte(EARTH)), 0, -0.05);
    place(scene, new THREE.Mesh(roundedCylinder(6, 0.36, 0.14, 96), matte(STONE_SIDE)), 0, -0.2);
    place(scene, new THREE.Mesh(roundedCylinder(5.6, 0.1, 0.04, 96), matte(STONE)), 0, -0.04);
    grassRing(scene, rand, { inner: 5.7, outer: 6.0, y: -0.15, clusters: 16, colors: GRASS });

    // Ornate emblem in the plaza floor, with a plain outer ring.
    const outer = new THREE.Mesh(new THREE.RingGeometry(2.97, 3.0, 96), matte(EMBLEM));
    outer.rotation.x = -Math.PI / 2;
    place(scene, outer, 0, 0.013, 0, false);
    const sigil = new Sigil(2.1, "#8fb7c0", { points: 8, seed: 21 });
    place(scene, sigil, 0, 0.014, 0, false);
    sigils.push(sigil);

    // Pillars around the back half, some with banners.
    for (let i = 0; i < 9; i++) {
      const a = BACK + ((i - 4) / 9) * 3.6;
      const pillar = column(1.9 + (i % 2) * 0.25);
      if (i % 2 === 0) {
        const banner = new THREE.Mesh(roundedBox(0.42, 0.85, 0.05, 0.04), matte(BANNER));
        banner.position.set(0, 1.25, 0.24);
        pillar.add(banner);
      }
      pillar.rotation.y = -a - Math.PI / 2;
      place(scene, pillar, Math.cos(a) * 5.15, 0, Math.sin(a) * 5.15);
    }

    // A round guardian dragon napping behind the circle.
    const dragon = sleepingDragon();
    dragon.rotation.y = -BACK - Math.PI / 2;
    place(scene, dragon, Math.cos(BACK) * 3.95, 0, Math.sin(BACK) * 3.95);

    // Clouds drifting below and around the island.
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2;
      const r = 6.5 + rand() * 4;
      const c = puff("#fbfcff", 0.7 + rand() * 0.8, rand, 5);
      c.scale.y = 0.6;
      const y = -2.6 + rand() * 2.2;
      place(scene, c, Math.cos(a) * r, y, Math.sin(a) * r, false);
      clouds.push({ obj: c, x: c.position.x, phase: rand() * 6 });
    }
    return 6.2;
  },

  animate(t) {
    for (const s of sigils) s.spin(t, 0.6);
    for (const c of clouds) c.obj.position.x = c.x + Math.sin(t * 0.15 + c.phase) * 0.6;
    if (dragonParts.breathe) dragonParts.breathe.scale.y = 1 + Math.sin(t * 1.3) * 0.03;
  },
};

function column(h: number) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(roundedBox(0.62, 0.22, 0.62, 0.07), matte(STONE_SIDE));
  base.position.y = 0.11;
  const shaft = new THREE.Mesh(roundedCylinder(0.2, h, 0.06, 24), matte(STONE));
  shaft.position.y = 0.22 + h / 2;
  const cap = new THREE.Mesh(roundedBox(0.58, 0.2, 0.58, 0.07), matte(STONE_SIDE));
  cap.position.y = 0.22 + h + 0.1;
  g.add(base, shaft, cap);
  return g;
}

function sleepingDragon() {
  const g = new THREE.Group();
  const body = mochiGeometry(0.95, 0.85, 0.2);
  const torso = new THREE.Mesh(body.geometry, matte(DRAGON));
  torso.scale.z = 1.15;
  g.add(torso);
  dragonParts.breathe = torso;

  // Head resting on the ground in front, eyes closed.
  const head = new THREE.Group();
  const skull = ball(DRAGON, 0.48);
  skull.scale.set(1, 0.85, 1);
  head.add(skull);
  const snout = ball(DRAGON_BELLY, 0.3);
  snout.scale.set(1, 0.7, 0.9);
  snout.position.set(0, -0.12, 0.36);
  head.add(snout);
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.1, 4, 8), matte("#4d4458"));
    eye.rotation.z = Math.PI / 2;
    eye.position.set(side * 0.2, 0.08, 0.42);
    eye.rotation.y = side * 0.4;
    head.add(eye);
    const horn = new THREE.Mesh(lathe([[0, 0], [0.07, 0], [0.04, 0.2], ...arc(0, 0.22, 0.03, 0, Math.PI / 2, 3)]), matte("#efe5cf"));
    horn.position.set(side * 0.24, 0.32, -0.12);
    horn.rotation.set(-0.5, 0, -side * 0.35);
    head.add(horn);
    const wing = ball("#c2dad6", 1);
    wing.scale.set(0.55, 0.07, 0.38);
    wing.position.set(side * 0.78, 0.82, -0.25);
    wing.rotation.set(0.35, side * 0.4, side * 0.45);
    g.add(wing);
  }
  head.position.set(0.25, 0.42, 1.38);
  head.rotation.set(0.15, 0.25, 0.1);
  g.add(head);

  // Tail curling around the front.
  const tail = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.17, 12, 32, Math.PI * 1.1), matte(DRAGON));
  tail.rotation.x = Math.PI / 2;
  tail.rotation.z = Math.PI * 0.95;
  tail.position.y = 0.14;
  g.add(tail);
  const tip = ball(DRAGON, 0.2);
  tip.position.set(Math.cos(Math.PI * 0.95 + Math.PI * 1.1) * -1.05, 0.15, Math.sin(Math.PI * 0.95 + Math.PI * 1.1) * 1.05);
  g.add(tip);
  return g;
}
