import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { MemberState } from "../sim/state";
import { Sigil } from "./magic";
import { palette } from "./palette";
import { mulberry32 } from "./random";

/** How members' lamp and floor sigils are tuned for a scene. */
export interface MemberLook {
  /** Lamp light height over the head (default 0.5). */
  lampHeight: number;
  /** Lamp light intensity at full level (default 2). */
  lampIntensity: number;
  /** Glow of the campaign and leader sigils. */
  sigilGlow: number;
  /** Multiplier of the sigils' dark underlay. */
  sigilInk: number;
}

const TIMER_SEGMENTS = 72;
const ROLE_LABEL: Record<string, string> = { Follower: "追隨者", Candidate: "候選人", Leader: "隊長" };

// ---------------------------------------------------------------------------
// Body: one sculpted piece, a soft bell with two rounded ears raised out of the
// dome, like a vinyl figure. Width about 1.06, height about 1.1 plus the ears.
// ---------------------------------------------------------------------------

const DOME_TOP = 1.1;
/** Height of the head between the ears; the crown sits here. */
export const BODY_H = DOME_TOP;
/** Height of the name tag over the head: just clear of the ears, or of the leader's lamp. */
const LABEL_LIFT = 0.55;
const LABEL_LIFT_LEADER = 0.85;
const EYE_Y = 0.71;
const EYE_X = 0.115;

const bodyGeometry = (() => {
  // Silhouette from the base to the crown of the head, resampled evenly so UVs are smooth.
  const outline = new THREE.CatmullRomCurve3(
    [
      [0, 0],
      [0.3, 0],
      [0.45, 0.012],
      [0.515, 0.06],
      [0.535, 0.13],
      [0.52, 0.24],
      [0.5, 0.4],
      [0.482, 0.56],
      [0.445, 0.75],
      [0.36, 0.93],
      [0.2, 1.06],
      [0, DOME_TOP],
    ].map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    "centripetal",
  );
  const profile = outline.getSpacedPoints(90).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  profile[0].x = 0;
  profile[profile.length - 1].x = 0;
  // phiStart = -PI puts the front (+z) in the middle of the texture, away from the seam.
  const g = new THREE.LatheGeometry(profile, 128, -Math.PI, Math.PI * 2);

  // Raise the ears out of the dome: a smooth bump around each ear axis, thinner front to back.
  const center = new THREE.Vector3(0, 0.58, 0);
  const ears = [-1, 1].map((s) => new THREE.Vector3(s * 0.56, 0.82, 0.05).normalize());
  const flat = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y, v.z * 2.4).normalize();
  const earsFlat = ears.map(flat);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.y < 0.55) continue;
    n.copy(v).sub(center).normalize();
    const nf = flat(n);
    let bump = 0;
    for (const e of earsFlat) {
      const ang = Math.acos(THREE.MathUtils.clamp(nf.dot(e), -1, 1));
      bump += Math.exp(-Math.pow(ang / 0.3, 2.2));
    }
    v.addScaledVector(n, bump * 0.2);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
})();

/** Where a feature at (x, y) on the front lands on the body, with the surface normal. */
const surface = (() => {
  const mesh = new THREE.Mesh(bodyGeometry);
  const ray = new THREE.Raycaster();
  return (x: number, y: number) => {
    ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(mesh, false)[0];
    const point = hit ? hit.point : new THREE.Vector3(x, y, 0.5);
    const normal = hit?.face ? hit.face.normal.clone() : new THREE.Vector3(0, 0, 1);
    return { point, normal };
  };
})();

// ---------------------------------------------------------------------------
// Crown: one piece. A thick band with rounded edges whose upper rim swells into
// five soft points, so it reads as a crown without any sharp corners.
// ---------------------------------------------------------------------------

const CROWN_POINTS = 5;
const CROWN_INNER = 0.15;
const CROWN_OUTER = 0.178;
const CROWN_MID = (CROWN_INNER + CROWN_OUTER) / 2;
const CROWN_RIM = 0.085; // Height of the band between the points
const CROWN_PEAK = 0.19; // Height at the tip of each point

function crownGeometry() {
  // Closed rounded-rectangle cross-section, spun around the axis.
  const r = 0.012;
  const profile: THREE.Vector2[] = [];
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= 5; i++) {
      const a = from + (i / 5) * (Math.PI / 2);
      profile.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  };
  corner(CROWN_OUTER - r, r, -Math.PI / 2); // Bottom outer
  corner(CROWN_OUTER - r, CROWN_RIM - r, 0); // Top outer
  corner(CROWN_INNER + r, CROWN_RIM - r, Math.PI / 2); // Top inner
  corner(CROWN_INNER + r, r, Math.PI); // Bottom inner
  profile.push(profile[0].clone());
  const g = new THREE.LatheGeometry(profile, 160);

  // Stretch the upper half of the band upward into the points.
  const split = CROWN_RIM * 0.45;
  const lift = (CROWN_PEAK - CROWN_RIM) / (CROWN_RIM - split);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (y <= split) continue;
    const a = Math.atan2(x, z);
    const point = Math.pow(0.5 + 0.5 * Math.cos(a * CROWN_POINTS), 2.4);
    // Points lean outward a touch, like a real crown.
    const flare = 1 + point * ((y - split) / (CROWN_RIM - split)) * 0.08;
    p.setXYZ(i, x * flare, split + (y - split) * (1 + lift * point), z * flare);
  }
  g.computeVertexNormals();
  return g;
}

// Geometry and materials shared by every member.
const shared = {
  eye: new THREE.SphereGeometry(1, 20, 14),
  line: new THREE.CapsuleGeometry(1, 1, 4, 8),
  crown: crownGeometry(),
  pearl: new THREE.SphereGeometry(1, 16, 12),
  lamp: new THREE.SphereGeometry(0.06, 18, 14),
  ring: new THREE.RingGeometry(0.62, 0.72, TIMER_SEGMENTS, 1),

  ink: new THREE.MeshStandardMaterial({ color: palette.ink, roughness: 0.45 }),
  whisker: new THREE.MeshStandardMaterial({ color: "#6d6268", roughness: 0.6 }),
  crownMat: new THREE.MeshPhysicalMaterial({ color: palette.crown, roughness: 0.36, metalness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  pearlMat: new THREE.MeshPhysicalMaterial({ color: "#fbf4e8", roughness: 0.28, sheen: 0.6, sheenColor: new THREE.Color("#ffe9f0") }),
  gemMats: ["#e8a0ae", "#9fd3c2", "#b9a8e6"].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 })),
  lampMat: new THREE.MeshStandardMaterial({ color: palette.lamp, emissive: palette.lamp, emissiveIntensity: 1.8, roughness: 0.5 }),
};

const sleepyTint = new THREE.Color(palette.sleepy);
const white = new THREE.Color(0xffffff);
/** Pushes the arc above the bloom threshold so themes with bloom light it softly. */
const TIMER_GLOW = 1.4;
const timerFull = new THREE.Color(palette.timerFull);
const timerLow = new THREE.Color(palette.timerLow);

/** One cluster member: a small rounded cat figure with a quiet face. */
export class Mochi {
  readonly root = new THREE.Group();
  /** Raycast target for clicks. */
  readonly hitMesh: THREE.Mesh;
  /** Squashes and stretches with the body; add accessories here. */
  readonly squash = new THREE.Group();

  private readonly hop = new THREE.Group();
  private readonly bodyMat: THREE.MeshPhysicalMaterial;
  private readonly openEyes: THREE.Object3D[] = [];
  private readonly closedEyes: THREE.Object3D[] = [];
  private readonly crown = new THREE.Group();
  private readonly lamp: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private readonly timerRing: THREE.Mesh;
  private readonly timerMat: THREE.MeshBasicMaterial;
  private readonly campaignSigil: Sigil;
  private readonly leaderSigil: Sigil;
  private readonly label: HTMLDivElement;
  private readonly labelObj: CSS2DObject;
  private labelKey = "";

  private readonly phase = Math.random() * Math.PI * 2;
  private sleep = 0; // 0 awake, 1 asleep (stopped)
  private bump = 0;
  private pop = 0;
  private crownScale = 0;
  private lampLevel = 0;
  private readonly lampHeight: number;
  private readonly lampIntensity: number;
  private campaign = 0;
  private leading = 0;
  private countdown = 0;
  private hover = 0;
  private hovered = false;
  private lastRole = "";
  /** Whether the leader wears the built-in crown; themes with their own headwear turn it off. */
  crownEnabled = true;

  constructor(readonly id: number, look?: MemberLook) {
    this.lampHeight = look?.lampHeight ?? 0.5;
    this.lampIntensity = look?.lampIntensity ?? 2;
    this.bodyMat = new THREE.MeshPhysicalMaterial({
      map: coatTexture(id),
      roughness: 0.5,
      sheen: 0.2,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color("#ffffff"),
      clearcoat: 0.15,
      clearcoatRoughness: 0.5,
    });

    this.root.add(this.hop);
    this.hop.add(this.squash);

    const mesh = new THREE.Mesh(bodyGeometry, this.bodyMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.memberId = id;
    this.hitMesh = mesh;
    this.squash.add(mesh);

    this.buildFace();
    this.buildCrown();
    this.squash.add(this.crown);

    // A small warm lamp floats over the leader and lights the floor around it.
    this.lamp = new THREE.Mesh(shared.lamp, shared.lampMat);
    this.lamp.position.y = BODY_H + 0.55;
    this.lamp.scale.setScalar(0);
    this.root.add(this.lamp);
    this.light = new THREE.PointLight(palette.lamp, 0, 3.2, 1.6);
    this.light.position.y = BODY_H + this.lampHeight;
    this.root.add(this.light);

    // Floor: election countdown ring, and sigils for campaigning and leading.
    this.timerMat = new THREE.MeshBasicMaterial({ color: palette.timerFull, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.timerRing = new THREE.Mesh(shared.ring.clone(), this.timerMat);
    this.timerRing.rotation.x = -Math.PI / 2;
    this.timerRing.rotation.z = Math.PI / 2;
    this.timerRing.position.y = 0.054;
    this.root.add(this.timerRing);
    this.campaignSigil = new Sigil(0.95, { scheme: "moon", simple: true, points: 5, seed: 1, ink: 0.55 * (look?.sigilInk ?? 1), ...(look && { glow: look.sigilGlow }) });
    this.leaderSigil = new Sigil(1.05, { scheme: "sun", simple: true, points: 6, seed: 0, ink: 0.5 * (look?.sigilInk ?? 1), ...(look && { glow: look.sigilGlow }) });
    for (const s of [this.campaignSigil, this.leaderSigil]) {
      s.position.y = 0.05;
      s.opacity = 0;
      this.root.add(s);
    }

    this.label = document.createElement("div");
    this.label.className = "member-label";
    this.labelObj = new CSS2DObject(this.label);
    this.labelObj.position.y = BODY_H + LABEL_LIFT;
    this.root.add(this.labelObj);
  }

  /** World position where messages leave and land. */
  anchor(target: THREE.Vector3) {
    return this.root.getWorldPosition(target).setY(BODY_H * (0.55 - this.sleep * 0.15));
  }

  receive() {
    this.bump = 1;
  }

  setHover(on: boolean) {
    this.hovered = on;
  }

  dispose() {
    this.label.remove();
    this.bodyMat.map?.dispose();
    this.bodyMat.dispose();
    this.timerMat.dispose();
    this.timerRing.geometry.dispose();
    for (const s of [this.campaignSigil, this.leaderSigil]) s.dispose();
  }

  update(dt: number, t: number, m: MemberState, now: number, camera: THREE.Vector3, noLeader: boolean) {
    const alive = m.alive;
    const role = alive ? m.role : "Down";
    if (role !== this.lastRole) {
      if (this.lastRole) this.pop = 1;
      this.lastRole = role;
    }

    const yaw = Math.atan2(camera.x - this.root.position.x, camera.z - this.root.position.z);
    this.root.rotation.y = lerpAngle(this.root.rotation.y, yaw, 1 - Math.exp(-dt * 5));

    this.sleep = damp(this.sleep, alive ? 0 : 1, 5, dt);
    this.bump = damp(this.bump, 0, 8, dt);
    this.pop = damp(this.pop, 0, 3.5, dt);
    this.hover = damp(this.hover, this.hovered && alive ? 1 : 0, 12, dt);

    // Slow breathing; candidates bob; stopped members slump a little.
    let lift = 0;
    let breathe = Math.sin(t * 1.8 + this.phase) * 0.01;
    if (alive && m.role === "Candidate") {
      const h = Math.abs(Math.sin(t * 3.6 + this.phase));
      lift = h * 0.09;
      breathe = (h - 0.5) * 0.035;
    }
    this.hop.position.y = lift;
    const sy = (1 + breathe) * (1 - this.bump * 0.07) * (1 - this.sleep * 0.12) * (1 + Math.sin(this.pop * Math.PI) * 0.05);
    const sxz = (1 / Math.sqrt(sy)) * (1 + this.hover * 0.05);
    this.squash.scale.set(sxz, sy * (1 + this.hover * 0.05), sxz);
    // Stopped members tilt their head, dozing off.
    this.squash.rotation.z = this.sleep * 0.14;

    const sleeping = this.sleep >= 0.5;
    this.openEyes.forEach((e) => (e.visible = !sleeping));
    this.closedEyes.forEach((e) => (e.visible = sleeping));
    this.bodyMat.color.lerp(alive ? white : sleepyTint, 1 - Math.exp(-dt * 3));

    const leading = alive && m.role === "Leader";
    this.crownScale = damp(this.crownScale, leading && this.crownEnabled ? 1 : 0, 7, dt);
    this.crown.scale.setScalar(this.crownScale);
    this.crown.visible = this.crownScale > 0.01;

    this.lampLevel = damp(this.lampLevel, leading ? 1 : 0, 3, dt);
    this.lamp.scale.setScalar(this.lampLevel);
    this.lamp.visible = this.lampLevel > 0.01;
    this.lamp.position.y = BODY_H + 0.55 + Math.sin(t * 1.6) * 0.04;
    this.light.intensity = this.lampLevel * this.lampIntensity;
    // The name tag stays close to the ears, and rises above the lamp while leading.
    this.labelObj.position.y = BODY_H + LABEL_LIFT + this.lampLevel * (LABEL_LIFT_LEADER - LABEL_LIFT);

    this.campaign = damp(this.campaign, alive && m.role === "Candidate" ? 1 : 0, 6, dt);
    this.campaignSigil.opacity = this.campaign * (0.75 + Math.sin(t * 3) * 0.15);
    this.campaignSigil.spin(t, 3);
    this.leading = damp(this.leading, leading ? 1 : 0, 3, dt);
    this.leaderSigil.opacity = this.leading * 0.9;
    this.leaderSigil.spin(t, 1);

    this.updateTimer(dt, m, now, alive, noLeader);
    this.updateLabel(m);
  }

  private updateTimer(dt: number, m: MemberState, now: number, alive: boolean, noLeader: boolean) {
    let fraction = 0;
    if (alive && m.timerStart !== null && m.timerDurationMs > 0) {
      fraction = Math.max(0, 1 - (now - m.timerStart) / m.timerDurationMs);
    }
    // The countdown only means something while no leader is alive to reset it.
    const show = alive && m.role === "Follower" && m.timerStart !== null && noLeader;
    this.countdown = damp(this.countdown, show ? 1 : 0, 12, dt);
    const visible = this.countdown > 0.01;
    this.timerRing.visible = visible && fraction > 0;
    if (visible) {
      this.timerMat.opacity = this.countdown * 0.95;
      this.timerRing.geometry.setDrawRange(0, Math.ceil(fraction * TIMER_SEGMENTS) * 6);
      this.timerMat.color.copy(timerLow).lerp(timerFull, fraction).multiplyScalar(TIMER_GLOW);
    }
  }

  private updateLabel(m: MemberState) {
    const status = !m.alive ? "停止" : ROLE_LABEL[m.role];
    const key = `${status}|${m.term}`;
    if (key === this.labelKey) return;
    this.labelKey = key;
    const cls = !m.alive ? "down" : m.role.toLowerCase();
    this.label.className = `member-label ${cls}`;
    this.label.innerHTML = `<span class="member-name">${m.id}</span><span class="member-role">${status}</span>`;
    this.label.title = `成員 ${m.id} · Term ${m.term}`;
  }

  /** Two small matte eyes set close and high, and fine whiskers. No mouth. */
  private buildFace() {
    const onSurface = (x: number, y: number, lift: number) => {
      const { point, normal } = surface(x, y);
      const g = new THREE.Group();
      g.position.copy(point).addScaledVector(normal, lift);
      g.lookAt(g.position.clone().add(normal));
      this.squash.add(g);
      return g;
    };
    for (const side of [-1, 1]) {
      const open = onSurface(side * EYE_X, EYE_Y, -0.004);
      const eye = new THREE.Mesh(shared.eye, shared.ink);
      eye.scale.set(0.031, 0.043, 0.014);
      open.add(eye);
      this.openEyes.push(open);

      const closed = onSurface(side * EYE_X, EYE_Y - 0.01, -0.002);
      const lid = new THREE.Mesh(shared.line, shared.ink);
      lid.scale.set(0.009, 0.045, 0.009);
      lid.rotation.z = Math.PI / 2;
      closed.add(lid);
      closed.visible = false;
      this.closedEyes.push(closed);

      // Two whiskers per side, angled slightly apart.
      for (const [dy, tilt] of [[0.0, 0.1], [-0.045, -0.08]] as const) {
        const w = onSurface(side * 0.255, EYE_Y - 0.075 + dy, -0.002);
        const hair = new THREE.Mesh(shared.line, shared.whisker);
        hair.scale.set(0.0055, 0.05, 0.0055);
        hair.rotation.z = Math.PI / 2 + side * tilt;
        w.add(hair);
      }
    }
  }

  private buildCrown() {
    this.crown.position.y = BODY_H - 0.05;
    const band = new THREE.Mesh(shared.crown, shared.crownMat);
    band.castShadow = true;
    this.crown.add(band);
    for (let i = 0; i < CROWN_POINTS; i++) {
      const a = (i / CROWN_POINTS) * Math.PI * 2;
      // A pearl on each point, and a gem on the band below it.
      const pearl = new THREE.Mesh(shared.pearl, shared.pearlMat);
      pearl.scale.setScalar(0.021);
      pearl.position.set(Math.sin(a) * CROWN_MID, CROWN_PEAK + 0.012, Math.cos(a) * CROWN_MID);
      this.crown.add(pearl);
      const gem = new THREE.Mesh(shared.pearl, shared.gemMats[i % shared.gemMats.length]);
      gem.scale.set(0.02, 0.024, 0.009);
      gem.position.set(Math.sin(a) * (CROWN_OUTER + 0.002), 0.043, Math.cos(a) * (CROWN_OUTER + 0.002));
      gem.rotation.y = a;
      this.crown.add(gem);
    }
    this.crown.rotation.set(-0.1, 0, 0.08); // Worn at a slight, jaunty angle
    this.crown.scale.setScalar(0);
  }
}

// ---------------------------------------------------------------------------
// Coats. The texture wraps the body: x = around (front at the center), y = from
// the top of the head (0) to the base (H).
// ---------------------------------------------------------------------------

type Coat = { base: string; draw?: (ctx: CanvasRenderingContext2D, W: number, H: number, rand: () => number) => void };

const COATS: Coat[] = [
  { base: "#f7f2ea" }, // Cream, plain like a little ghost
  {
    base: "#f7f1e7", // Calico: ginger over one eye and ear, a brown patch on the back
    draw: (ctx, W, H, rand) => {
      blob(ctx, W * 0.33, H * 0.17, W * 0.09, H * 0.2, "#e2ae7c", rand); // Over the left ear and eye
      blob(ctx, W * 0.08, H * 0.42, W * 0.1, H * 0.2, "#8d7262", rand);
      blob(ctx, W * 0.82, H * 0.62, W * 0.08, H * 0.16, "#e2ae7c", rand);
    },
  },
  {
    base: "#cfcbcf", // Grey tabby: stripes over the head and back
    draw: (ctx, W, H) => stripes(ctx, W, H, "#a59fa6"),
  },
  {
    base: "#f3d6b4", // Ginger tabby with a pale chest
    draw: (ctx, W, H) => {
      stripes(ctx, W, H, "#e3b07f");
      soft(ctx, W * 0.5, H * 0.72, W * 0.09, H * 0.28, "#fbf3ea");
    },
  },
  {
    base: "#f5ede3", // Colorpoint: ears and face fade to warm brown
    draw: (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.32);
      g.addColorStop(0, "rgba(184, 156, 136, 0.85)");
      g.addColorStop(1, "rgba(184, 156, 136, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.32);
      soft(ctx, W * 0.5, H * 0.3, W * 0.05, H * 0.07, "rgba(190, 162, 142, 0.45)");
    },
  },
  {
    base: "#e2e4ea", // Blue-grey with a white bib
    draw: (ctx, W, H) => soft(ctx, W * 0.5, H * 0.75, W * 0.1, H * 0.3, "#f6f6f8"),
  },
];

function coatTexture(id: number) {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const coat = COATS[id % COATS.length];
  ctx.fillStyle = coat.base;
  ctx.fillRect(0, 0, W, H);
  coat.draw?.(ctx, W, H, mulberry32(id + 1));
  // A faint warm shade toward the base, like light falling off a figure.
  const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
  g.addColorStop(0, "rgba(120, 90, 80, 0)");
  g.addColorStop(1, "rgba(120, 90, 80, 0.12)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** An organic patch, slightly irregular. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, rand: () => number) {
  const pts = 9;
  const radii = Array.from({ length: pts }, () => 0.75 + rand() * 0.4);
  const at = (i: number) => {
    const a = (i / pts) * Math.PI * 2;
    const r = radii[((i % pts) + pts) % pts];
    return [x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r] as const;
  };
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const [x0, y0] = at(i);
    const [x1, y1] = at(i + 1);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(x0, y0, mx, my);
  }
  ctx.closePath();
  ctx.fill();
}

/** A soft-edged oval patch, drawn with a gradient (canvas filters are slow). */
function soft(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  const c = new THREE.Color().setStyle(color.replace(/rgba\(([^,]+,[^,]+,[^,]+),[^)]*\)/, "rgb($1)"));
  const alpha = /rgba\(.*,\s*([\d.]+)\)/.exec(color)?.[1] ?? "1";
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(0.7, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Tabby stripes: short bars on the forehead, longer curved bands around the back. */
function stripes(ctx: CanvasRenderingContext2D, W: number, H: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = H * 0.03;
  for (const dx of [-0.025, 0, 0.025]) {
    ctx.beginPath();
    ctx.moveTo(W * (0.5 + dx), H * 0.1);
    ctx.lineTo(W * (0.5 + dx * 0.8), H * 0.2);
    ctx.stroke();
  }
  ctx.lineWidth = H * 0.035;
  for (let i = 0; i < 5; i++) {
    const y = H * (0.28 + i * 0.12);
    ctx.beginPath();
    ctx.moveTo(W * 0.15, y - H * 0.04);
    ctx.quadraticCurveTo(W * 0.0, y + H * 0.02, -W * 0.15, y - H * 0.04);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * 1.15, y - H * 0.04);
    ctx.quadraticCurveTo(W * 1.0, y + H * 0.02, W * 0.85, y - H * 0.04);
    ctx.stroke();
  }
  ctx.restore();
}

function damp(from: number, to: number, rate: number, dt: number) {
  return from + (to - from) * (1 - Math.exp(-rate * dt));
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
