import * as THREE from "three";

const extrude = { depth: 0.3, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.16, bevelSegments: 5, curveSegments: 14 };

/** A soft, puffy heart about 1 unit across, centered on the origin. */
export function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.85);
  s.bezierCurveTo(-0.2, -0.65, -1, -0.25, -1, 0.25);
  s.bezierCurveTo(-1, 0.75, -0.45, 1, 0, 0.55);
  s.bezierCurveTo(0.45, 1, 1, 0.75, 1, 0.25);
  s.bezierCurveTo(1, -0.25, 0.2, -0.65, 0, -0.85);
  return normalize(new THREE.ExtrudeGeometry(s, extrude));
}

/** A cylinder whose top and bottom edges are rounded by bevel, centered on the origin. */
export function roundedCylinder(radius: number, height: number, bevel: number, segments = 64) {
  const pts: THREE.Vector2[] = [];
  const h = height / 2;
  const b = Math.min(bevel, radius, h);
  pts.push(new THREE.Vector2(0, -h));
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - b + Math.cos(a) * b, -h + b + Math.sin(a) * b));
  }
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - b + Math.cos(a) * b, h - b + Math.sin(a) * b));
  }
  pts.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(pts, segments);
}

/**
 * A mochi-like body: a superellipse dome with a flatter base, resting on y = 0.
 * Returns the geometry and a function giving the body's radius at height y.
 */
export function mochiGeometry(width: number, top: number, bottom: number) {
  const profile: THREE.Vector2[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = -Math.PI / 2 + (i / steps) * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const n = s < 0 ? 4.5 : 2.5; // Flat underside, round top
    const x = width * Math.pow(Math.abs(c), 2 / n);
    const y = (s < 0 ? bottom : top) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n) + bottom;
    profile.push(new THREE.Vector2(Math.max(x, i === 0 || i === steps ? 0 : 0.001), y));
  }
  const geometry = new THREE.LatheGeometry(profile, 48);
  const radiusAt = (y: number) => {
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1];
      const b = profile[i];
      if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
    }
    return 0;
  };
  return { geometry, radiusAt, height: top + bottom };
}

function normalize(geo: THREE.BufferGeometry) {
  geo.center();
  geo.computeBoundingSphere();
  const r = geo.boundingSphere!.radius;
  geo.scale(1 / r, 1 / r, 1 / r);
  return geo;
}
