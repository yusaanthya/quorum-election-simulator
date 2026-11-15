import * as THREE from "three";
import { palette } from "./palette";

const COUNT = 64;

interface Mote {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
}

/** Soft motes that drift up around a newly elected leader. */
export class Sparkles {
  private readonly mesh: THREE.InstancedMesh;
  private readonly motes: Mote[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshBasicMaterial({ color: palette.sparkle, transparent: true, opacity: 0.9 }),
      COUNT,
    );
    this.mesh.frustumCulled = false;
    for (let i = 0; i < COUNT; i++) {
      this.motes.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1 });
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
    scene.add(this.mesh);
  }

  burst(at: THREE.Vector3, amount = 22) {
    for (let n = 0; n < amount; n++) {
      const mote = this.motes[this.next];
      this.next = (this.next + 1) % COUNT;
      const a = Math.random() * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.5;
      mote.pos.set(at.x + Math.cos(a) * r, at.y + Math.random() * 0.4, at.z + Math.sin(a) * r);
      mote.vel.set(Math.cos(a) * 0.15, 0.5 + Math.random() * 0.5, Math.sin(a) * 0.15);
      mote.max = mote.life = 1.6 + Math.random() * 1.2;
    }
  }

  update(dt: number) {
    let active = false;
    this.motes.forEach((mote, i) => {
      if (mote.life <= 0) return;
      active = true;
      mote.life -= dt;
      mote.pos.addScaledVector(mote.vel, dt);
      const k = Math.max(0, mote.life / mote.max);
      const scale = Math.sin(k * Math.PI); // Fade in, then out
      this.mesh.setMatrixAt(i, this.m.compose(mote.pos, this.q, this.s.setScalar(scale)));
    });
    if (active) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
