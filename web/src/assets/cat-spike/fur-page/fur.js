// Fur spike: shared uniforms, coat patterns, the strand normal map (A), shell fur (B) and the mochi deformation.
import * as THREE from 'three';

// Uniform objects shared by every material; main.js copies the panel values into them.
export const U = {
  uFurNormal: { value: null },
  uNormalScale: { value: 9 },
  uNormalStrength: { value: 0.94 },
  uShells: { value: 22 },
  uThickness: { value: 0.46 },
  uRimColor: { value: new THREE.Color('#c9c4e8') },
  uGravity: { value: 0.43 },
  uWind: { value: 0.19 },
  uTime: { value: 0 },
  // Landmarks in body space, measured from the model in main.js.
  uEarL: { value: new THREE.Vector3() },
  uEarR: { value: new THREE.Vector3() },
  uFace: { value: new THREE.Vector3() }, // between the eyes
  uMuzzle: { value: new THREE.Vector3() }, // between the whiskers
};

export const PATTERNS = ['solid', 'stripes', 'patches', 'points', 'bicolour'];

/** Per-cat motion state, read by every deformed material of that cat. */
export function catUniforms(bodyH) {
  return {
    uCatInv: { value: new THREE.Matrix4() }, // world -> cat space (cats only turn about y)
    uBodyH: { value: bodyH },
    uSquash: { value: 0 }, // >0 squash, <0 stretch, base-anchored
    uLag: { value: 0 }, // top lag in metres (<0: top sags)
    uFurTrail: { value: 0 }, // fur tip offset along +y, in fur lengths
    uFurPuff: { value: 0 }, // fur tip offset along the splayed normal, in fur lengths
  };
}

/** Per-coat uniforms (one set per cast slot, shared by that slot's A, B and compare cats). */
export function coatUniforms() {
  return {
    uPattern: { value: 0 }, uSeed: { value: 0 },
    uCol0: { value: new THREE.Color() }, uCol1: { value: new THREE.Color() }, uCol2: { value: new THREE.Color() },
    uFurLength: { value: 0.071 }, uDensity: { value: 135 },
    // Per coat, so white fur is not greyed by the dark roots that suit the black cat.
    uRootDark: { value: 0.42 }, uBaldTint: { value: 0.8 }, uRim: { value: 0.8 },
    uScatter: { value: 0 }, // soft fill proportional to the coat colour: light fur scattering light into its shadows
  };
}

/** JS mirror of mochiDeform() in the shader: displacement of body-space point p. */
export function mochiDeform(p, q, lag, H, out) {
  const w = THREE.MathUtils.clamp(p.y / H, 0, 1);
  const spread = (1 + q * (0.35 + 0.6 * (1 - w))) * (1 - ((0.6 * lag) / H) * w);
  return out.set(p.x * spread - p.x, -p.y * q + lag * w * w, p.z * spread - p.z);
}

const DEFORM_PARS = /* glsl */ `
uniform mat4 uCatInv;
uniform float uBodyH, uSquash, uLag, uDeformOn;
// Base-anchored squash with a volume-keeping spread (widest at the base), plus the top lag.
vec3 mochiDeform(vec3 pb) {
  float w = clamp(pb.y / uBodyH, 0.0, 1.0);
  float spread = (1.0 + uSquash * (0.35 + 0.6 * (1.0 - w))) * (1.0 - 0.6 * uLag / uBodyH * w);
  return vec3(pb.x * spread - pb.x, -pb.y * uSquash + uLag * w * w, pb.z * spread - pb.z);
}`;
// Applied to the undeformed vertex, before any shell extrusion, so shells stay glued to the body.
// Deformed parts (body, eyes, whiskers) are only translated inside the cat, so a cat-space
// displacement is also a mesh-space one.
const DEFORM_MAIN = /* glsl */ `
vec3 pb = (uCatInv * modelMatrix * vec4(position, 1.0)).xyz;
transformed += mochiDeform(pb) * uDeformOn;`;

// Coat colour, evaluated per vertex in body space (fur blurs the vertex-rate edges anyway).
const COAT = /* glsl */ `
uniform float uPattern, uSeed, uIsTail;
uniform vec3 uCol0, uCol1, uCol2, uPartOffset, uEarL, uEarR, uFace, uMuzzle;
varying vec3 vCoat;
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return 0.6 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 7.3) + 0.1 * vnoise(p * 4.3 + 1.7); }
vec3 coat(vec3 lp) {
  vec3 p = lp + uPartOffset;                     // body space; the tail uses its rest pose
  vec3 s = p + uSeed * vec3(7.31, 3.17, 5.13);
  float tailT = uIsTail * smoothstep(0.05, 0.6, length(lp)); // 0 at the tail root, 1 at the tip
  float ear = max(smoothstep(0.26, 0.06, distance(p, uEarL)), smoothstep(0.26, 0.06, distance(p, uEarR)));
  float face = smoothstep(0.34, 0.12, distance(p, uFace));
  float chest = smoothstep(0.15, 0.45, p.z) * smoothstep(0.62, 0.3, p.y) * (1.0 - uIsTail);
  int pat = int(uPattern + 0.5);
  if (pat == 1) { // mackerel tabby: noise-warped bands running down from the spine, rings on the tail
    float warp = fbm(s * 3.0) * 2.6;
    float v = uIsTail > 0.5 ? sin(length(lp) * 38.0 + warp) : sin(atan(p.x, -p.z) * 7.0 + p.y * 2.0 + warp);
    float band = smoothstep(0.0, 0.7, v) * (1.0 - 0.85 * face) * (1.0 - chest);
    return mix(mix(uCol0, uCol1, band), uCol2, chest * 0.85);
  }
  if (pat == 2) { // calico / tortie: two thresholded noise fields over a base, white chest
    float a = smoothstep(0.47, 0.53, fbm(s * 2.4));
    float b = smoothstep(0.50, 0.56, fbm(s * 2.4 + 19.7)) * (1.0 - 0.6 * face);
    return mix(mix(mix(uCol0, uCol1, a), uCol2, b), uCol0, chest);
  }
  if (pat == 3) { // colour-point: darker ears, muzzle mask and tail
    float mask = smoothstep(0.42, 0.1, distance(p, mix(uMuzzle, uFace, 0.35))) * 0.9; // whole face, eyes inside
    float back = 0.25 * smoothstep(0.0, -0.6, p.z) * (1.0 - uIsTail); // a little shading on the back
    return mix(uCol0, uCol1, max(max(ear, mask), max(tailT, back)));
  }
  if (pat == 4) { // bicolour: white chest and muzzle with a noisy edge, white tail tip
    float edge = (fbm(s * 4.0) - 0.5) * 0.25;
    float w = max(smoothstep(0.1, 0.35, p.z + edge) * smoothstep(0.6, 0.38, p.y + edge),
                  smoothstep(0.2, 0.1, distance(p, uMuzzle) + edge));
    w = mix(w * (1.0 - uIsTail), 1.0, uIsTail * smoothstep(0.85, 1.0, tailT));
    return mix(uCol0, uCol1, w);
  }
  return mix(uCol0, uCol1, ear); // solid; col1 tints the ears
}`;

function injectDeform(sh, extraPars = '', extraMain = '') {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + DEFORM_PARS + extraPars)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + DEFORM_MAIN + extraMain);
}

/** Eyes and whiskers: the GLB material plus the cat's deformation, so they ride the surface. */
export function makeDecalMaterial(src, u) {
  const m = src.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uDeformOn: { value: 1 } });
    injectDeform(sh);
  };
  return m;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable heightfield of short strands running along +v, turned into a tangent-space normal map. */
export function makeFurNormalMap(size = 256, strands = 3500, seed = 7) {
  const rnd = mulberry32(seed);
  const h = new Float32Array(size * size);
  const wrap = (i) => ((i % size) + size) % size;
  for (let s = 0; s < strands; s++) {
    const x = rnd() * size, y = rnd() * size;
    const len = 6 + rnd() * 14, a = (rnd() - 0.5) * 0.5, top = 0.5 + rnd() * 0.5;
    const dx = Math.sin(a), dy = Math.cos(a);
    for (let t = 0; t < len; t += 0.5) {
      const px = x + dx * t, py = y + dy * t, v = top * (0.4 + (0.6 * t) / len);
      const cx = Math.floor(px), cy = Math.floor(py);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const ex = cx + i + 0.5 - px, ey = cy + j + 0.5 - py;
        const w = v * Math.exp(-(ex * ex + ey * ey) / 0.6);
        const k = wrap(cy + j) * size + wrap(cx + i);
        if (w > h[k]) h[k] = w;
      }
    }
  }
  const at = (x, y) => h[wrap(y) * size + wrap(x)];
  const data = new Uint8Array(size * size * 4);
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    n.set((at(x - 1, y) - at(x + 1, y)) * 2, (at(x, y - 1) - at(x, y + 1)) * 2, 1).normalize();
    const o = (y * size + x) * 4;
    data[o] = (n.x * 0.5 + 0.5) * 255; data[o + 1] = (n.y * 0.5 + 0.5) * 255; data[o + 2] = (n.z * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// The model's UVs are a smart-project atlas (random island orientation), so the
// normal map is sampled triplanar in object space: strands run along object Y on the sides.
const TRIPLANAR = /* glsl */ `
uniform sampler2D uFurNormal;
uniform float uNormalScale, uNormalStrength, uTint, uBald, uScatter;
uniform mat4 modelMatrix;
varying vec3 vObjPos, vObjN, vCoat;
varying float vFurMask;
vec3 furNormal(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= w.x + w.y + w.z;
  p *= uNormalScale;
  vec2 tx = (texture2D(uFurNormal, p.zy).xy * 2.0 - 1.0) * uNormalStrength;
  vec2 ty = (texture2D(uFurNormal, p.xz).xy * 2.0 - 1.0) * uNormalStrength;
  vec2 tz = (texture2D(uFurNormal, p.xy).xy * 2.0 - 1.0) * uNormalStrength;
  // UDN blend: add each plane's tangent offset in the plane's axes.
  return normalize(n + vec3(0.0, tx.y, tx.x) * w.x + vec3(ty.x, 0.0, ty.y) * w.y + vec3(tz.x, tz.y, 0.0) * w.z);
}`;

/**
 * Variant A material, and B's base layer: the GLB fur material with the coat colour and the
 * normal map. The base is tinted by mix(bald, tint, furMask): root colour under fur, lighter
 * where the face mask removes fur, so the bald patch reads as short fur instead of a hole.
 */
export function makeSurfaceMaterial(src, u, { tint, bald, deform }) {
  const m = src.clone();
  m.side = THREE.FrontSide;
  m.vertexColors = false;
  m.color.set('#ffffff');
  m.sheen = 1;
  m.sheenRoughness = 0.5;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, u, { uTint: tint, uBald: bald, uDeformOn: { value: deform } });
    injectDeform(sh, '\nattribute float furMask;\nvarying vec3 vObjPos, vObjN;\nvarying float vFurMask;\n' + COAT,
      '\nvObjPos = position; vObjN = objectNormal; vFurMask = furMask; vCoat = coat(position);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TRIPLANAR)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCoat * mix(uBald, uTint, vFurMask);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mat3(viewMatrix) * mat3(modelMatrix) * furNormal(vObjPos, normalize(vObjN)));')
      .replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * uScatter;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'fur-surface';
  return m;
}

/** Variant B shells: one instanced draw per mesh, gl_InstanceID = shell index. */
export function makeShellMaterial(u, deform) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, u, { uDeformOn: { value: deform } });
    injectDeform(sh, `
attribute float furMask;
uniform float uShells, uFurLength, uGravity, uWind, uTime, uFurTrail, uFurPuff;
varying float vLayer, vMask;
varying vec3 vBase, vBaseN;` + COAT, `
float layer = float(gl_InstanceID + 1) / uShells;
float len = uFurLength;
vLayer = layer; vMask = furMask; vBase = position; vBaseN = objectNormal; vCoat = coat(position);
transformed += objectNormal * len * layer;
float bend = len * layer * layer;              // tips bend most
transformed.y -= uGravity * bend;
transformed.x += uWind * bend * sin(uTime * 2.3 + position.y * 7.0 + position.z * 5.0);
// Fur reaction: tips trail against the surface acceleration (more at the top) and puff outward.
vec3 splay = normalize(objectNormal + 0.6 * vec3(objectNormal.x, 0.0, objectNormal.z));
float hw = clamp(pb.y / uBodyH, 0.0, 1.0);
transformed += (vec3(0.0, uFurTrail * (0.4 + 0.6 * hw), 0.0) + splay * uFurPuff) * bend;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uDensity, uThickness, uRootDark, uRim, uScatter;
uniform vec3 uRimColor;
varying float vLayer, vMask;
varying vec3 vBase, vBaseN, vCoat;
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
// One strand per cell of a grid projected on the dominant axis of the base normal.
vec3 an = abs(vBaseN);
vec2 fp = (an.x > an.y && an.x > an.z) ? vBase.zy : (an.y > an.z ? vBase.xz : vBase.xy);
fp *= uDensity;
vec3 rnd = hash32(floor(fp));
vec2 d = fract(fp) - 0.5 - (rnd.xy - 0.5) * 0.4;
// Strand length = random length x face mask, so fur shortens gradually towards the eyes and whiskers.
float t = vLayer / max(mix(0.5, 1.0, rnd.z) * vMask, 1e-4);
if (t > 1.0 || length(d) > uThickness * (1.0 - t)) discard;`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCoat * mix(uRootDark, 1.0, vLayer);')
      .replace('#include <opaque_fragment>', `float rim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 2.0);
outgoingLight += uRimColor * uRim * rim * vLayer * vLayer + diffuseColor.rgb * uScatter;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'fur-shell';
  return m;
}

/** Shares the source geometry's buffers (including its furMask attribute). */
export function makeShellGeometry(geo) {
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(geo.index);
  for (const [k, v] of Object.entries(geo.attributes)) g.setAttribute(k, v);
  g.instanceCount = U.uShells.value;
  geo.computeBoundingSphere();
  g.boundingSphere = geo.boundingSphere.clone();
  g.boundingSphere.radius += 0.3;
  return g;
}

/**
 * Fur length factor per vertex: 0 on and right next to the eye and whisker decals, easing up
 * to 1 by `far` metres away, and fading out at the flat base so fur does not go through the floor.
 */
export function faceMask(geo, decalPoints, near = 0.01, far = 0.13, baseFade = 0.08) {
  const p = geo.attributes.position, mask = new Float32Array(p.count), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let d2 = Infinity;
    for (const q of decalPoints) d2 = Math.min(d2, v.distanceToSquared(q));
    mask[i] = THREE.MathUtils.smoothstep(Math.sqrt(d2), near, far) * THREE.MathUtils.smoothstep(v.y, 0, baseFade);
  }
  return mask;
}
