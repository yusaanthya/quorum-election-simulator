import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { MemberState } from "../sim/state";
import { Sigil } from "./magic";
import { palette } from "./palette";
import { buildCat, type Cat } from "./cat";
import { U, mochiDeform } from "./fur";
import { HopSchedule } from "./hop";

export { beginCast, loadCatModel } from "./cat";

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

/** Height of the name tag over the ear tips and their fur, or over the leader's lamp. */
const LABEL_LIFT = 0.42;
const LABEL_LIFT_LEADER = 0.72;
/** Lamp height over the head. */
const LAMP_LIFT = 0.55;

// Mochi bounce, from the fur spike's defaults: hop cycle, squash spring, top-lag spring, tail spring.
const G = 9.8;
const KQ = 350; // squash spring is fixed and snappy; the wobble is the top lag
const CQ = 17;
const HOP_HEIGHT = 0.3;
const SQUASH = 1;
const WOBBLE_STIFFNESS = 120;
const WOBBLE_DAMPING = 6;
/** A received message lands like a small hop's impact, in m/s. */
const BUMP_IMPACT = 1;
/** Stopped members slump into this much squash. */
const SLEEP_SQUASH = 0.12;

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
  crown: crownGeometry(),
  pearl: new THREE.SphereGeometry(1, 16, 12),
  lamp: new THREE.SphereGeometry(0.06, 18, 14),
  // The inner edge clears the widest furry body (0.598 + 0.095 of fur) at rest.
  ring: new THREE.RingGeometry(0.72, 0.82, TIMER_SEGMENTS, 1),

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

const tmp = new THREE.Vector3();

/** One cluster member: a furry mochi cat. */
export class Mochi {
  readonly root = new THREE.Group();
  /** Raycast target for clicks. */
  readonly hitMesh: THREE.Mesh;
  /** Carries the cat and its accessories: tilts in sleep and grows on hover. */
  readonly squash = new THREE.Group();

  private readonly hop = new THREE.Group();
  private readonly cat: Cat;
  private readonly crownRest: THREE.Vector3;
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
  // Bounce state: hop phase, height and speed, squash, top lag and tail springs.
  private hopState: "idle" | "crouch" | "push" | "air" = "idle";
  private readonly hopClock = new HopSchedule(this.phase);
  private crouchEnd = 0;
  private y = 0;
  private v = 0;
  private q = 0;
  private qV = 0;
  private qT = 0;
  private lag = 0;
  private lagV = 0;
  private tailA = 0;
  private tailV = 0;
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

    this.root.add(this.hop);
    this.hop.add(this.squash);

    this.cat = buildCat(id);
    this.cat.body.userData.memberId = id;
    this.hitMesh = this.cat.body;
    this.squash.add(this.cat.root);

    // The crown sits on the fur between the ears.
    this.crownRest = new THREE.Vector3(0, this.cat.headTop + this.cat.furLength - 0.05, 0);
    this.buildCrown();
    this.squash.add(this.crown);

    // A small warm lamp floats over the leader and lights the floor around it.
    this.lamp = new THREE.Mesh(shared.lamp, shared.lampMat);
    this.lamp.position.y = this.cat.headTop + LAMP_LIFT;
    this.lamp.scale.setScalar(0);
    this.root.add(this.lamp);
    this.light = new THREE.PointLight(palette.lamp, 0, 3.2, 1.6);
    this.light.position.y = this.cat.headTop + this.lampHeight;
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
    this.labelObj.position.y = this.labelBase();
    this.root.add(this.labelObj);
  }

  /** Name tag height: over the ear tips and their fur. */
  private labelBase() {
    return this.cat.bodyH + this.cat.furLength + LABEL_LIFT;
  }

  /** World position where messages leave and land. */
  anchor(target: THREE.Vector3) {
    return this.root.getWorldPosition(target).setY(this.cat.headTop * (0.55 - this.sleep * 0.15));
  }

  /** A message lands: a small impact, like the end of a hop. */
  receive() {
    this.qV += BUMP_IMPACT * 1.9 * SQUASH;
    this.lagV -= BUMP_IMPACT * 0.34 * SQUASH;
    this.tailV += BUMP_IMPACT * 0.8;
  }

  setHover(on: boolean) {
    this.hovered = on;
  }

  dispose() {
    this.label.remove();
    for (const m of this.cat.materials) m.dispose();
    this.timerMat.dispose();
    this.timerRing.geometry.dispose();
    for (const s of [this.campaignSigil, this.leaderSigil]) s.dispose();
  }

  update(dt: number, t: number, m: MemberState, now: number, camera: THREE.Vector3, noLeader: boolean) {
    const alive = m.alive;
    const role = alive ? m.role : "Down";
    if (role !== this.lastRole) {
      // A role change pops: a quick stretch with the top leading.
      if (this.lastRole) {
        this.qV -= 1.6 * SQUASH;
        this.lagV += 0.4 * SQUASH;
        this.tailV += 0.5;
      }
      this.lastRole = role;
    }

    const yaw = Math.atan2(camera.x - this.root.position.x, camera.z - this.root.position.z);
    this.root.rotation.y = lerpAngle(this.root.rotation.y, yaw, 1 - Math.exp(-dt * 5));

    this.sleep = damp(this.sleep, alive ? 0 : 1, 5, dt);
    this.hover = damp(this.hover, this.hovered && alive ? 1 : 0, 12, dt);

    // Candidates hop; stopped members slump a little; everyone breathes.
    const hopping = alive && m.role === "Candidate";
    const n = Math.ceil(dt * 240);
    for (let i = 0; i < n; i++) this.step(dt / n, hopping);
    const q = THREE.MathUtils.clamp(this.q, -0.4, 0.5) + 0.012 * Math.sin(t * 1.8 + this.phase);
    const cat = this.cat;
    cat.u.uSquash.value = q;
    cat.u.uLag.value = this.lag;
    U.uTime.value = t;
    this.hop.position.y = this.y;
    // The tail pivot rides the deformed surface; the tail itself swings on its own spring.
    cat.tail.position.copy(cat.tailRest).add(mochiDeform(cat.tailRest, q, this.lag, cat.bodyH, tmp));
    cat.tail.quaternion.setFromAxisAngle(cat.tailAxis, this.tailA);
    this.squash.scale.setScalar(1 + this.hover * 0.05);
    // Stopped members tilt their head, dozing off.
    this.squash.rotation.z = this.sleep * 0.14;

    const sleeping = this.sleep >= 0.5;
    cat.eyes.forEach((e) => (e.visible = !sleeping));
    cat.lids.forEach((e) => (e.visible = sleeping));
    for (const mat of cat.furMats) mat.color.lerp(alive ? white : sleepyTint, 1 - Math.exp(-dt * 3));

    // The crown and the lamp ride the deformed top of the head.
    const head = mochiDeform(this.crownRest, q, this.lag, cat.bodyH, tmp).y;
    const leading = alive && m.role === "Leader";
    this.crownScale = damp(this.crownScale, leading && this.crownEnabled ? 1 : 0, 7, dt);
    this.crown.scale.setScalar(this.crownScale);
    this.crown.visible = this.crownScale > 0.01;
    this.crown.position.y = this.crownRest.y + head;

    this.lampLevel = damp(this.lampLevel, leading ? 1 : 0, 3, dt);
    this.lamp.scale.setScalar(this.lampLevel);
    this.lamp.visible = this.lampLevel > 0.01;
    this.lamp.position.y = cat.headTop + LAMP_LIFT + this.y + head + Math.sin(t * 1.6) * 0.04;
    this.light.position.y = cat.headTop + this.lampHeight + this.y + head;
    this.light.intensity = this.lampLevel * this.lampIntensity;
    // The name tag stays close to the ears, and rises above the lamp while leading.
    this.labelObj.position.y = this.labelBase() + this.lampLevel * (LABEL_LIFT_LEADER - LABEL_LIFT);

    // The deformation works in cat space.
    cat.root.updateWorldMatrix(true, false);
    cat.u.uCatInv.value.copy(cat.root.matrixWorld).invert();

    this.campaign = damp(this.campaign, alive && m.role === "Candidate" ? 1 : 0, 6, dt);
    this.campaignSigil.opacity = this.campaign * (0.75 + Math.sin(t * 3) * 0.15);
    this.campaignSigil.spin(t, 3);
    this.leading = damp(this.leading, leading ? 1 : 0, 3, dt);
    this.leaderSigil.opacity = this.leading * 0.9;
    this.leaderSigil.spin(t, 1);

    this.updateTimer(dt, m, now, alive, noLeader);
    this.updateLabel(m);
  }

  /** One substep of the fur spike's bounce: hop cycle, squash spring, top lag and tail. */
  private step(h: number, hopping: boolean) {
    const takeoff = this.hopClock.tick(h, hopping, this.hopState === "idle");
    const simT = this.hopClock.simT;
    if (takeoff) {
      this.hopState = "crouch";
      this.crouchEnd = simT + 0.1;
      this.qT = 0.1 * SQUASH; // anticipation crouch
    }
    if (this.hopState === "crouch" && simT >= this.crouchEnd) {
      this.hopState = "push"; // stretch up while the base is still on the ground
      this.qT = -0.16 * SQUASH;
    }
    if (this.hopState === "push" && simT >= this.crouchEnd + 0.06) {
      const v0 = Math.sqrt(2 * G * HOP_HEIGHT);
      this.hopState = "air";
      this.v = v0;
      this.qT = 0;
      this.qV -= v0 * SQUASH; // keep stretching through takeoff
      this.lagV += v0 * 0.17 * SQUASH; // top leads
      this.tailV += v0 * 0.8;
    }
    if (this.hopState === "air") {
      this.v -= G * h;
      this.y += this.v * h;
      if (this.y <= 0) {
        const impact = -this.v;
        this.y = 0;
        this.v = 0;
        this.hopState = "idle";
        this.hopClock.landed();
        this.qV += impact * 1.9 * SQUASH; // base spreads, top flattens
        this.lagV -= impact * 0.34 * SQUASH; // top keeps falling, then wobbles back
        this.tailV += impact * 0.8;
      }
    }
    this.qV += (-KQ * (this.q - (this.qT + this.sleep * SLEEP_SQUASH)) - CQ * this.qV) * h;
    this.q += this.qV * h;
    this.lagV += (-WOBBLE_STIFFNESS * this.lag - WOBBLE_DAMPING * this.lagV) * h;
    this.lag += this.lagV * h;
    this.tailV += (-WOBBLE_STIFFNESS * 0.6 * this.tailA - WOBBLE_DAMPING * 0.6 * this.tailV) * h;
    this.tailA += this.tailV * h;
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

  private buildCrown() {
    this.crown.position.copy(this.crownRest);
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

function damp(from: number, to: number, rate: number, dt: number) {
  return from + (to - from) * (1 - Math.exp(-rate * dt));
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
