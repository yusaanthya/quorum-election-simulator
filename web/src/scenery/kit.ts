import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Role } from "../sim/events";
import type { MemberLook, Mochi } from "../scene/mochi";
import type { Lighting } from "../scene/stage";

/** A themed setting for the cluster: scenery plus how members dress for it. */
export interface Theme {
  id: string;
  title: string;
  background: readonly [string, string, string];
  /** Radius of the circle members stand on; the widest one if layout varies it. */
  standRadius: number;
  /** Overrides the circle with explicit positions (index, count) -> [x, z]. */
  layout?: (i: number, n: number) => [number, number];
  /** Radius around the scene's vertical axis that messages fly around, for a centerpiece standing there. */
  keepClear?: number;
  /** Builds the scenery; returns its outer radius. Called once. */
  build(scene: THREE.Scene): number;
  /** Scene lighting; absent keeps the stage's default daylight. */
  lighting?: Lighting;
  /** Bloom strength; absent means no bloom pass. */
  bloom?: number;
  /** How members' lamp and floor sigils are tuned for this scene; absent keeps the defaults. */
  memberLook?: MemberLook;
  /** Adds theme headwear to a member; called once per member. */
  dress?(m: Mochi): void;
  /** Per-frame animation of the scenery and accessories. */
  animate?(t: number, dt: number): void;
  /** Lets accessories react to a member's role. */
  onRole?(m: Mochi, role: Role | "Down"): void;
}

/** Where member i of n stands, as [x, z]: the theme's own layout, or evenly around its circle. */
export function standAt(theme: Theme, i: number, n: number): [number, number] {
  if (theme.layout) return theme.layout(i, n);
  const a = (i / n) * Math.PI * 2 + 0.35;
  return [Math.sin(a) * theme.standRadius, Math.cos(a) * theme.standRadius];
}

const mats = new Map<string, THREE.MeshStandardMaterial>();

/** Shared matte material per color (and glow). */
export function matte(color: string, glow = 0) {
  const key = `${color}|${glow}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, emissive: glow ? color : "#000000", emissiveIntensity: glow });
    mats.set(key, m);
  }
  return m;
}

export function roundedBox(w: number, h: number, d: number, r: number) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
}

/** Adds mesh to parent with shadows on, at x, y, z. */
export function place<T extends THREE.Object3D>(parent: THREE.Object3D, obj: T, x = 0, y = 0, z = 0, shadows = true): T {
  obj.position.set(x, y, z);
  if (shadows) {
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  parent.add(obj);
  return obj;
}

const sphere = new THREE.SphereGeometry(1, 28, 20);

/** A soft cluster of spheres, for clouds and foliage. */
export function puff(color: string, size: number, rand: () => number, lobes = 5) {
  const g = new THREE.Group();
  for (let i = 0; i < lobes; i++) {
    const m = new THREE.Mesh(sphere, matte(color));
    const r = size * (0.55 + rand() * 0.45);
    const a = (i / lobes) * Math.PI * 2;
    m.scale.setScalar(r);
    m.position.set(Math.cos(a) * size * 0.55, (rand() - 0.3) * size * 0.4, Math.sin(a) * size * 0.4);
    g.add(m);
  }
  const core = new THREE.Mesh(sphere, matte(color));
  core.scale.setScalar(size * 0.85);
  core.position.y = size * 0.15;
  g.add(core);
  return g;
}

export function ball(color: string, r: number, glow = 0) {
  const m = new THREE.Mesh(sphere, matte(color, glow));
  m.scale.setScalar(r);
  return m;
}

/** Lathe from a list of [radius, y] points. */
export function lathe(points: [number, number][], segments = 40) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

/** Points on a quarter circle, for rounded lathe corners. */
export function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 6): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Grass blades scattered in a ring. */
export function grassRing(parent: THREE.Object3D, rand: () => number, opts: { inner: number; outer: number; y: number; clusters: number; colors: readonly string[] }) {
  const blade = new THREE.CapsuleGeometry(0.035, 0.3, 4, 8);
  for (let c = 0; c < opts.clusters; c++) {
    const a = (c / opts.clusters) * Math.PI * 2 + rand() * 0.3;
    const r = opts.inner + rand() * (opts.outer - opts.inner);
    const tuft = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let b = 0; b < n; b++) {
      const m = new THREE.Mesh(blade, matte(opts.colors[Math.floor(rand() * opts.colors.length)]));
      const h = 0.45 + rand() * 0.6;
      m.scale.set(1, h, 0.6);
      m.position.set((rand() - 0.5) * 0.28, 0.2 * h, (rand() - 0.5) * 0.28);
      m.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.6);
      tuft.add(m);
    }
    place(parent, tuft, Math.cos(a) * r, opts.y, Math.sin(a) * r);
  }
}
