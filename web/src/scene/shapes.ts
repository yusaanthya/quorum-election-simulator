import * as THREE from "three";

const extrude = { depth: 0.35, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.14, bevelSegments: 4, curveSegments: 12 };

/** A puffy five-point star about 1 unit across, centered on the origin. */
export function starGeometry() {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : 0.48;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return normalize(new THREE.ExtrudeGeometry(shape, extrude));
}

/** A puffy heart about 1 unit across, centered on the origin. */
export function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-0.15, -0.7, -1, -0.25, -1, 0.25);
  s.bezierCurveTo(-1, 0.75, -0.45, 1, 0, 0.55);
  s.bezierCurveTo(0.45, 1, 1, 0.75, 1, 0.25);
  s.bezierCurveTo(1, -0.25, 0.15, -0.7, 0, -0.9);
  return normalize(new THREE.ExtrudeGeometry(s, extrude));
}

function normalize(geo: THREE.BufferGeometry) {
  geo.center();
  geo.computeBoundingSphere();
  const r = geo.boundingSphere!.radius;
  geo.scale(1 / r, 1 / r, 1 / r);
  return geo;
}
