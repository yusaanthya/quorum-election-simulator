import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { MemberState } from "../sim/state";
import { palette } from "./palette";
import { starGeometry } from "./shapes";

const BODY_R = 0.55;
const BODY_LEN = 0.6;
const BODY_Y = BODY_R + BODY_LEN / 2 + 0.12; // Body center when standing
const TIMER_SEGMENTS = 72;

const ROLE_LABEL: Record<string, string> = { Follower: "追隨者", Candidate: "候選人", Leader: "隊長" };

// Geometry and materials shared by every bean.
const shared = {
  body: new THREE.CapsuleGeometry(BODY_R, BODY_LEN, 10, 32),
  eye: new THREE.SphereGeometry(0.115, 20, 16),
  shine: new THREE.SphereGeometry(0.035, 10, 8),
  cheek: new THREE.CircleGeometry(0.085, 20),
  smile: new THREE.TorusGeometry(0.075, 0.02, 8, 20, Math.PI),
  xBar: new THREE.BoxGeometry(0.2, 0.04, 0.03),
  arm: new THREE.CapsuleGeometry(0.11, 0.22, 6, 12),
  foot: new THREE.SphereGeometry(0.17, 16, 12),
  star: starGeometry(),
  ring: new THREE.RingGeometry(0.82, 0.96, TIMER_SEGMENTS, 1),
  halo: new THREE.CircleGeometry(1.15, 48),

  eyeMat: new THREE.MeshPhysicalMaterial({ color: 0x2b2238, roughness: 0.15, clearcoat: 1 }),
  shineMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  cheekMat: new THREE.MeshBasicMaterial({ color: 0xff7fae, transparent: true, opacity: 0.55, depthWrite: false }),
  smileMat: new THREE.MeshBasicMaterial({ color: 0x2b2238 }),
  crownMat: new THREE.MeshStandardMaterial({ color: palette.crown, metalness: 0.55, roughness: 0.28, emissive: 0x5a3a00, emissiveIntensity: 0.25 }),
  gemMat: new THREE.MeshPhysicalMaterial({ color: palette.gem, roughness: 0.1, clearcoat: 1 }),
  starMat: new THREE.MeshStandardMaterial({ color: palette.star, roughness: 0.35, emissive: palette.star, emissiveIntensity: 0.35 }),
};

const tmpColor = new THREE.Color();
const sleepyColor = new THREE.Color(palette.sleepy);
const timerFull = new THREE.Color(palette.timerFull);
const timerLow = new THREE.Color(palette.timerLow);

/** One cluster member drawn as a squishy jelly bean. */
export class Bean {
  readonly root = new THREE.Group();
  /** Raycast target for clicks. */
  readonly hitMesh: THREE.Mesh;

  private readonly hop = new THREE.Group();
  private readonly squash = new THREE.Group();
  private readonly bodyMat: THREE.MeshPhysicalMaterial;
  private readonly baseColor: THREE.Color;
  private readonly eyes: THREE.Object3D[] = [];
  private readonly xEyes: THREE.Object3D[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly crown: THREE.Group;
  private readonly star: THREE.Mesh;
  private readonly dizzy = new THREE.Group();
  private readonly timerRing: THREE.Mesh;
  private readonly timerMat: THREE.MeshBasicMaterial;
  private readonly trackRing: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly label: HTMLDivElement;
  private labelKey = "";

  private readonly phase = Math.random() * Math.PI * 2;
  private tip = 0; // 0 standing, 1 lying down
  private bump = 0; // Squash from a received message
  private pop = 0; // Bounce on a role change
  private crownScale = 0;
  private starScale = 0;
  private hover = false;
  private lastRole = "";

  constructor(readonly id: number) {
    this.baseColor = new THREE.Color(palette.beans[id % palette.beans.length]);
    this.bodyMat = new THREE.MeshPhysicalMaterial({
      color: this.baseColor.clone(),
      roughness: 0.42,
      clearcoat: 0.85,
      clearcoatRoughness: 0.22,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xffffff),
    });

    this.root.add(this.hop);
    this.hop.add(this.squash);
    this.squash.position.y = BODY_Y;

    const body = new THREE.Mesh(shared.body, this.bodyMat);
    body.castShadow = true;
    body.userData.memberId = id;
    this.hitMesh = body;
    this.squash.add(body);

    this.buildFace();
    this.buildLimbs();
    this.crown = this.buildCrown();
    this.squash.add(this.crown);

    this.star = new THREE.Mesh(shared.star, shared.starMat);
    this.star.position.y = BODY_R + BODY_LEN / 2 + 0.55;
    this.star.scale.setScalar(0);
    this.squash.add(this.star);

    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(shared.star, shared.starMat);
      s.scale.setScalar(0.12);
      this.dizzy.add(s);
    }
    this.dizzy.visible = false;
    this.root.add(this.dizzy);

    // Ground decorations: election countdown ring and a role halo.
    this.trackRing = new THREE.Mesh(
      shared.ring,
      new THREE.MeshBasicMaterial({ color: palette.timerTrack, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.timerMat = new THREE.MeshBasicMaterial({ color: palette.timerFull, depthWrite: false, side: THREE.DoubleSide });
    this.timerRing = new THREE.Mesh(shared.ring.clone(), this.timerMat);
    for (const ring of [this.trackRing, this.timerRing]) {
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      this.root.add(ring);
    }
    this.timerRing.position.y = 0.035;

    this.haloMat = new THREE.MeshBasicMaterial({ color: palette.leaderHalo, transparent: true, opacity: 0, depthWrite: false });
    this.halo = new THREE.Mesh(shared.halo, this.haloMat);
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.02;
    this.root.add(this.halo);

    this.label = document.createElement("div");
    this.label.className = "bean-label";
    const labelObj = new CSS2DObject(this.label);
    labelObj.position.y = BODY_Y + BODY_R + BODY_LEN / 2 + 0.95;
    this.root.add(labelObj);
  }

  /** World position of the bean's chest, where messages leave and land. */
  chest(target: THREE.Vector3) {
    return this.root.getWorldPosition(target).setY(BODY_Y + (this.tip > 0.5 ? -0.5 : 0.1));
  }

  receive() {
    this.bump = 1;
  }

  setHover(on: boolean) {
    this.hover = on;
  }

  dispose() {
    this.label.remove();
    this.bodyMat.dispose();
    this.timerMat.dispose();
    this.haloMat.dispose();
    (this.trackRing.material as THREE.Material).dispose();
    this.timerRing.geometry.dispose();
  }

  update(dt: number, t: number, m: MemberState, now: number, camera: THREE.Vector3) {
    const alive = m.alive;
    const role = alive ? m.role : "Down";
    if (role !== this.lastRole) {
      if (this.lastRole) this.pop = 1;
      this.lastRole = role;
    }

    // Turn to face the viewer, like a group photo.
    const yaw = Math.atan2(camera.x - this.root.position.x, camera.z - this.root.position.z);
    this.root.rotation.y = lerpAngle(this.root.rotation.y, yaw, 1 - Math.exp(-dt * 6));

    // Fall over when stopped.
    this.tip = damp(this.tip, alive ? 0 : 1, 7, dt);
    this.hop.rotation.x = -this.tip * Math.PI / 2;
    this.hop.position.y = this.tip * (BODY_R - 0.1);

    this.bump = damp(this.bump, 0, 9, dt);
    this.pop = damp(this.pop, 0, 4, dt);

    let lift = 0;
    let stretch = 1 + Math.sin(t * 3.2 + this.phase) * 0.025;
    let armUp = 0.25 + Math.sin(t * 2 + this.phase) * 0.1;
    let armWave = 0;
    if (alive && m.role === "Candidate") {
      // Excited hopping with both arms up.
      const h = Math.abs(Math.sin(t * 7 + this.phase));
      lift = h * 0.32;
      stretch = 1 + (h - 0.5) * 0.12;
      armUp = 2.5;
      armWave = Math.sin(t * 14) * 0.35;
    } else if (alive && m.role === "Leader") {
      // Proud sway and a slow wave.
      stretch = 1 + Math.sin(t * 2.2 + this.phase) * 0.04;
      armUp = 0.4;
      armWave = Math.sin(t * 3) > 0.3 ? 1.8 + Math.sin(t * 10) * 0.4 : 0;
    } else if (!alive) {
      armUp = 1.4;
      stretch = 1;
    }
    this.hop.position.y += lift;

    const squashY = stretch * (1 - this.bump * 0.14) * (1 + Math.sin(this.pop * Math.PI) * 0.18);
    const hoverScale = this.hover && alive ? 1.08 : 1;
    this.squash.scale.set(hoverScale / Math.sqrt(squashY), hoverScale * squashY, hoverScale / Math.sqrt(squashY));

    this.arms.forEach((arm, i) => {
      const side = i === 0 ? 1 : -1;
      const raise = i === 0 ? armUp + armWave : armUp + (m.role === "Leader" ? 0 : armWave);
      arm.rotation.z = damp(arm.rotation.z, side * (0.35 + raise), 10, dt);
    });

    // Sleepy grey when stopped.
    this.bodyMat.color.lerp(alive ? this.baseColor : tmpColor.copy(this.baseColor).lerp(sleepyColor, 0.75), 1 - Math.exp(-dt * 4));
    this.eyes.forEach((e) => (e.visible = alive));
    this.xEyes.forEach((e) => (e.visible = !alive));

    // Accessories.
    this.crownScale = damp(this.crownScale, alive && m.role === "Leader" ? 1 : 0, 8, dt);
    this.crown.scale.setScalar(this.crownScale);
    this.crown.visible = this.crownScale > 0.01;
    this.crown.rotation.y = Math.sin(t * 1.5) * 0.25;

    this.starScale = damp(this.starScale, alive && m.role === "Candidate" ? 0.28 : 0, 9, dt);
    this.star.scale.setScalar(this.starScale);
    this.star.visible = this.starScale > 0.01;
    this.star.rotation.y = t * 4;
    this.star.position.y = BODY_R + BODY_LEN / 2 + 0.6 + Math.sin(t * 6) * 0.06;

    this.dizzy.visible = !alive && m.halted && this.tip > 0.8;
    if (this.dizzy.visible) {
      this.dizzy.children.forEach((s, i) => {
        const a = t * 3 + (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.45, 0.95, -0.95 + Math.sin(a) * 0.45);
        s.rotation.y = t * 5;
      });
    }

    this.updateGround(t, m, now, alive);
    this.updateLabel(m);
  }

  private updateGround(t: number, m: MemberState, now: number, alive: boolean) {
    let fraction = 0;
    if (alive && m.timerStart !== null && m.timerDurationMs > 0) {
      fraction = Math.max(0, 1 - (now - m.timerStart) / m.timerDurationMs);
    }
    const showTimer = alive && m.role !== "Leader" && m.timerStart !== null;
    this.timerRing.visible = showTimer && fraction > 0;
    this.trackRing.visible = showTimer;
    if (showTimer) {
      this.timerRing.geometry.setDrawRange(0, Math.ceil(fraction * TIMER_SEGMENTS) * 6);
      this.timerMat.color.copy(timerLow).lerp(timerFull, Math.min(1, fraction * 1.6));
    }

    if (alive && m.role === "Leader") {
      this.haloMat.color.set(palette.leaderHalo);
      this.haloMat.opacity = 0.45 + Math.sin(t * 3) * 0.12;
      this.halo.scale.setScalar(1);
    } else if (alive && m.role === "Candidate") {
      const p = (t * 1.2) % 1;
      this.haloMat.color.set(palette.candidateHalo);
      this.haloMat.opacity = 0.55 * (1 - p);
      this.halo.scale.setScalar(0.6 + p * 0.8);
    } else {
      this.haloMat.opacity = 0;
    }
    this.halo.visible = this.haloMat.opacity > 0.01;
  }

  private updateLabel(m: MemberState) {
    const status = !m.alive ? (m.halted ? "累倒了" : "下線") : ROLE_LABEL[m.role];
    const key = `${status}|${m.term}|${m.role}|${m.alive}`;
    if (key === this.labelKey) return;
    this.labelKey = key;
    const cls = !m.alive ? "down" : m.role.toLowerCase();
    this.label.className = `bean-label ${cls}`;
    this.label.innerHTML = `<span class="bean-name">豆豆 ${m.id}</span><span class="bean-role">${status}</span><span class="bean-term">T${m.term}</span>`;
  }

  private buildFace() {
    const faceY = 0.26;
    const eyeAngle = 0.32;
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      placeOnBody(eye, side * eyeAngle, faceY, 0.0);
      const ball = new THREE.Mesh(shared.eye, shared.eyeMat);
      ball.scale.set(0.85, 1.15, 0.55);
      eye.add(ball);
      const shine = new THREE.Mesh(shared.shine, shared.shineMat);
      shine.position.set(-0.03, 0.05, 0.06);
      eye.add(shine);
      this.squash.add(eye);
      this.eyes.push(eye);

      const x = new THREE.Group();
      placeOnBody(x, side * eyeAngle, faceY, 0.01);
      const a = new THREE.Mesh(shared.xBar, shared.smileMat);
      a.rotation.z = Math.PI / 4;
      const b = new THREE.Mesh(shared.xBar, shared.smileMat);
      b.rotation.z = -Math.PI / 4;
      x.add(a, b);
      x.visible = false;
      this.squash.add(x);
      this.xEyes.push(x);

      const cheek = new THREE.Mesh(shared.cheek, shared.cheekMat);
      placeOnBody(cheek, side * 0.62, faceY - 0.17, 0.004);
      this.squash.add(cheek);
    }
    const smile = new THREE.Mesh(shared.smile, shared.smileMat);
    placeOnBody(smile, 0, faceY - 0.2, 0.005);
    smile.rotation.z = Math.PI;
    this.squash.add(smile);
  }

  private buildLimbs() {
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (BODY_R - 0.04), -0.05, 0);
      const arm = new THREE.Mesh(shared.arm, this.bodyMat);
      arm.position.y = -0.2;
      arm.castShadow = true;
      pivot.add(arm);
      pivot.rotation.z = side * 0.35;
      this.squash.add(pivot);
      this.arms.push(pivot);

      const foot = new THREE.Mesh(shared.foot, this.bodyMat);
      foot.scale.set(1, 0.62, 1.35);
      foot.position.set(side * 0.23, 0.1, 0.06);
      foot.castShadow = true;
      this.hop.add(foot);
    }
  }

  private buildCrown() {
    const crown = new THREE.Group();
    crown.position.y = BODY_R + BODY_LEN / 2 - 0.02;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.14, 28), shared.crownMat);
    band.castShadow = true;
    crown.add(band);
    const spike = new THREE.ConeGeometry(0.075, 0.2, 12);
    const gem = new THREE.SphereGeometry(0.04, 10, 8);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const s = new THREE.Mesh(spike, shared.crownMat);
      s.position.set(Math.sin(a) * 0.25, 0.16, Math.cos(a) * 0.25);
      crown.add(s);
      const g = new THREE.Mesh(gem, shared.gemMat);
      g.position.set(Math.sin(a) * 0.25, 0.27, Math.cos(a) * 0.25);
      crown.add(g);
    }
    crown.rotation.z = 0.12;
    crown.scale.setScalar(0);
    return crown;
  }
}

/** Places obj on the front of the body at angle theta around Y, facing outward. */
function placeOnBody(obj: THREE.Object3D, theta: number, y: number, lift: number) {
  const r = BODY_R + lift;
  obj.position.set(Math.sin(theta) * r, y, Math.cos(theta) * r);
  obj.rotation.y = theta;
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
