// The GLB mochi cat with shell fur, one coat per member. Ported from the fur spike.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import catUrl from "../assets/cat/cat_v2.glb?url";
import { PATTERNS, coatFor } from "./coats";
import {
  U,
  catUniforms,
  coatUniforms,
  faceMask,
  makeDecalMaterial,
  makeFurNormalMap,
  makeShellGeometry,
  makeShellMaterial,
  makeSurfaceMaterial,
} from "./fur";

const DECAL_PARTS = ["Eye_L", "Eye_R", "Whiskers_L", "Whiskers_R"];
/** Closed eyes: an arc under the middle of each ring, in the ring's own plane. */
const LID_RADIUS = 0.085;
const LID_TUBE = 0.013;
const LID_RAISE = 0.03;
const LID_LIFT = 0.012;

interface CatModel {
  template: THREE.Object3D;
  furSrc: THREE.MeshPhysicalMaterial;
  /** The fur-bearing GLB geometries the shells are built over. */
  bodyGeo: THREE.BufferGeometry;
  tailGeo: THREE.BufferGeometry;
  lidGeos: Record<"Eye_L" | "Eye_R", THREE.BufferGeometry>;
  /** Top of the body (ear tips), the height the deformation is normalised to. */
  bodyH: number;
  /** Top of the head between the ears. */
  headTop: number;
  tailAxis: THREE.Vector3;
}

let model: CatModel | null = null;
/** The current cast's body and tail shell geometries, shared by its members. */
let shellGeos: [THREE.InstancedBufferGeometry, THREE.InstancedBufferGeometry] | null = null;

/** Loads the cat once; every member clones it. */
export async function loadCatModel() {
  if (model) return;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(catUrl);
  const template = gltf.scene;
  template.updateMatrixWorld(true);
  const body = template.getObjectByName("Body") as THREE.Mesh;
  const tail = template.getObjectByName("Tail") as THREE.Mesh;
  const furSrc = body.material as THREE.MeshPhysicalMaterial;
  body.geometry.computeBoundingBox();
  const bodyH = body.geometry.boundingBox!.max.y;
  body.geometry.computeBoundingSphere();
  body.geometry.boundingSphere!.radius += 0.3; // squash spreads the base

  U.uFurNormal.value = makeFurNormalMap();

  // Decal vertices in Body space, for the face mask.
  // (A multi-material node such as Eye_L loads as a group of meshes.)
  const decals: THREE.Vector3[] = [];
  const toBody = body.matrixWorld.clone().invert();
  for (const name of DECAL_PARTS) {
    body.getObjectByName(name)!.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const p = (o as THREE.Mesh).geometry.attributes.position;
      const m = toBody.clone().multiply(o.matrixWorld);
      for (let i = 0; i < p.count; i++) decals.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m));
    });
  }
  body.geometry.setAttribute("furMask", new THREE.BufferAttribute(faceMask(body.geometry, decals), 1));
  tail.geometry.setAttribute("furMask", new THREE.BufferAttribute(new Float32Array(tail.geometry.attributes.position.count).fill(1), 1));

  // Pattern landmarks: ear tips (highest vertex on each side), between the eyes, between the whiskers.
  const p = body.geometry.attributes.position;
  const v = new THREE.Vector3();
  let headTop = 0;
  U.uEarL.value.set(0, -1, 0);
  U.uEarR.value.set(0, -1, 0);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ear = v.x > 0 ? U.uEarL.value : U.uEarR.value;
    if (Math.abs(v.x) > 0.1 && v.y > ear.y) ear.copy(v);
    if (Math.abs(v.x) < 0.05 && Math.abs(v.z) < 0.2) headTop = Math.max(headTop, v.y);
  }
  const at = (n: string) => body.getObjectByName(n)!.position;
  U.uFace.value.addVectors(at("Eye_L"), at("Eye_R")).multiplyScalar(0.5);
  U.uMuzzle.value.addVectors(at("Whiskers_L"), at("Whiskers_R")).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.06, 0.12));

  // Tail swing axis: turning about it moves the tail's centre towards -y (tip droops).
  tail.geometry.computeBoundingBox();
  const tailDir = tail.geometry.boundingBox!.getCenter(new THREE.Vector3()).normalize();
  const tailAxis = new THREE.Vector3().crossVectors(tailDir, new THREE.Vector3(0, -1, 0)).normalize();

  // Closed-lid arcs, baked into body space at each ring's centre and facing along the body's
  // normal there, so they stay translation-only parts that the deformation can move.
  const normals = body.geometry.attributes.normal;
  const lidGeos = {} as CatModel["lidGeos"];
  for (const side of ["Eye_L", "Eye_R"] as const) {
    const eye = body.getObjectByName(side)!;
    const ring = eye.children.find((o) => ((o as THREE.Mesh).material as THREE.Material).name === "M_EyeRing") as THREE.Mesh;
    ring.geometry.computeBoundingBox();
    const centre = ring.geometry.boundingBox!.getCenter(new THREE.Vector3()).add(eye.position);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < p.count; i++) {
      const d = v.fromBufferAttribute(p, i).distanceToSquared(centre);
      if (d < bestD) (bestD = d), (best = i);
    }
    const n = new THREE.Vector3().fromBufferAttribute(normals, best).normalize();
    const x = new THREE.Vector3(0, 1, 0).cross(n).normalize();
    const y = new THREE.Vector3().crossVectors(n, x);
    const g = new THREE.TorusGeometry(LID_RADIUS, LID_TUBE, 8, 24, Math.PI);
    g.rotateZ(Math.PI); // the lower half: a sleepy, downward curve
    g.translate(0, LID_RAISE, 0);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, n).setPosition(centre.addScaledVector(n, LID_LIFT)));
    lidGeos[side] = g;
  }

  model = { template, furSrc, bodyGeo: body.geometry, tailGeo: tail.geometry, lidGeos, bodyH, headTop, tailAxis };
}

/**
 * Starts a new cast drawn with `shells` fur shells: replaces the previous cast's shell
 * geometries. The GLB geometry they are built over is kept.
 */
export function beginCast(shells: number) {
  if (!model) throw new Error("loadCatModel() must finish before a cast begins");
  for (const g of shellGeos ?? []) g.dispose();
  shellGeos = [makeShellGeometry(model.bodyGeo, shells), makeShellGeometry(model.tailGeo, shells)];
  U.uShells.value = shells;
}

type ColorMaterial = THREE.Material & { color: THREE.Color };

/** One member's cat: a clone of the model with its own coat, fur and motion uniforms. */
export interface Cat {
  root: THREE.Object3D;
  body: THREE.Mesh;
  tail: THREE.Object3D;
  tailRest: THREE.Vector3;
  tailAxis: THREE.Vector3;
  u: ReturnType<typeof catUniforms>;
  /** Open eyes (the GLB rings) and the closed lids that replace them in sleep. */
  eyes: THREE.Object3D[];
  lids: THREE.Mesh[];
  /** The fur and skin materials, tinted when the member stops. */
  furMats: ColorMaterial[];
  materials: THREE.Material[];
  bodyH: number;
  headTop: number;
  furLength: number;
}

export function buildCat(id: number): Cat {
  if (!model) throw new Error("loadCatModel() must finish before members are built");
  if (!shellGeos) throw new Error("beginCast() must run before members are built");
  const { coat, seed } = coatFor(id);
  const cu = coatUniforms();
  cu.uPattern.value = PATTERNS.indexOf(coat.pattern);
  cu.uCol0.value.set(coat.col0);
  cu.uCol1.value.set(coat.col1);
  cu.uCol2.value.set(coat.col2);
  cu.uFurLength.value = coat.furLength;
  cu.uDensity.value = coat.density;
  cu.uSeed.value = seed;
  cu.uRootDark.value = coat.rootDarkness;
  cu.uBaldTint.value = coat.baldTint;
  cu.uRim.value = coat.tipRim;
  cu.uScatter.value = coat.scatter;
  cu.uRoomRim.value = coat.roomRim;

  const root = model.template.clone(true);
  const mu = catUniforms(model.bodyH);
  const u = Object.assign({}, mu, cu);
  const tail = root.getObjectByName("Tail")!;
  const body = root.getObjectByName("Body") as THREE.Mesh;
  const bodyPart = { ...u, uPartOffset: { value: new THREE.Vector3() }, uIsTail: { value: 0 } };
  const tailPart = { ...u, uPartOffset: { value: tail.position.clone() }, uIsTail: { value: 1 } };
  const look = { tint: cu.uRootDark, bald: cu.uBaldTint };
  const furMats: ColorMaterial[] = [];
  const materials: THREE.Material[] = [];
  const decalMats = new Map<string, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    if (mesh.name === "Body" || mesh.name === "Tail") {
      // The tail is rigid and swings on its pivot.
      const m = makeSurfaceMaterial(model!.furSrc, mesh.name === "Body" ? bodyPart : tailPart, { ...look, deform: mesh.name === "Body" ? 1 : 0 });
      furMats.push(m);
      materials.push(m);
      mesh.material = m;
      return;
    }
    const src = mesh.material as THREE.MeshStandardMaterial;
    const part = DECAL_PARTS.find((n) => mesh.name.startsWith(n) || mesh.parent!.name.startsWith(n))!;
    // Iris rings get one material per eye (odd eyes), whiskers their own (per-coat tint).
    const key = src.name === "M_EyeRing" ? part : part.startsWith("Whiskers") ? "whisker" : src.uuid;
    let m = decalMats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = makeDecalMaterial(src, u);
      if (key === "Eye_L") m.color.set(coat.eyeL);
      else if (key === "Eye_R") m.color.set(coat.eyeR);
      else if (key === "whisker") m.color.set(coat.whisker);
      decalMats.set(key, m);
      materials.push(m);
    }
    mesh.material = m;
  });

  for (const [geo, part, parent] of [
    [shellGeos[0], bodyPart, body],
    [shellGeos[1], tailPart, tail],
  ] as const) {
    const m = makeShellMaterial(part, parent === body ? 1 : 0);
    const shell = new THREE.Mesh(geo, m);
    // The AO pass would draw every shell as the bare body, undeformed.
    shell.userData.skipAO = true;
    parent.add(shell);
    furMats.push(m);
    materials.push(m);
  }

  const lids = (["Eye_L", "Eye_R"] as const).map((side) => {
    const m = makeDecalMaterial(new THREE.MeshStandardMaterial({ color: side === "Eye_L" ? coat.eyeL : coat.eyeR, roughness: 0.5 }), u);
    materials.push(m);
    const lid = new THREE.Mesh(model!.lidGeos[side], m);
    lid.visible = false;
    body.add(lid);
    return lid;
  });

  return {
    root,
    body,
    tail,
    tailRest: tail.position.clone(),
    tailAxis: model.tailAxis,
    u: mu,
    eyes: ["Eye_L", "Eye_R"].map((n) => body.getObjectByName(n)!),
    lids,
    furMats,
    materials,
    bodyH: model.bodyH,
    headTop: model.headTop,
    furLength: coat.furLength,
  };
}
