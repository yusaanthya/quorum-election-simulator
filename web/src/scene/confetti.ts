import * as THREE from "three";
import { palette } from "./palette";

const COUNT = 160;
const GRAVITY = -9;

interface Bit {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
}

/** A burst of candy confetti for each newly elected leader. */
export class Confetti {
  private readonly mesh: THREE.InstancedMesh;
  private readonly bits: Bit[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.12, 0.2),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      COUNT,
    );
    this.mesh.frustumCulled = false;
    const color = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      this.bits.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0 });
      this.mesh.setColorAt(i, color.set(palette.confetti[i % palette.confetti.length]));
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
    scene.add(this.mesh);
  }

  burst(at: THREE.Vector3, amount = 70) {
    for (let n = 0; n < amount; n++) {
      const b = this.bits[this.next];
      this.next = (this.next + 1) % COUNT;
      const a = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      b.pos.copy(at);
      b.vel.set(Math.cos(a) * speed, 4 + Math.random() * 4, Math.sin(a) * speed);
      b.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
      b.life = 2.2 + Math.random() * 0.8;
    }
  }

  update(dt: number) {
    let active = false;
    this.bits.forEach((b, i) => {
      if (b.life <= 0) return;
      active = true;
      b.life -= dt;
      b.vel.y += GRAVITY * dt;
      b.vel.multiplyScalar(1 - dt * 1.2); // Air drag makes it flutter
      b.pos.addScaledVector(b.vel, dt);
      if (b.pos.y < 0.03) {
        b.pos.y = 0.03;
        b.vel.set(0, 0, 0);
        b.spin.multiplyScalar(0.8);
      }
      b.rot.x += b.spin.x * dt;
      b.rot.y += b.spin.y * dt;
      b.rot.z += b.spin.z * dt;
      const scale = b.life > 0 ? Math.min(1, b.life / 0.4) : 0;
      this.mesh.setMatrixAt(i, this.m.compose(b.pos, this.q.setFromEuler(b.rot), this.s.setScalar(scale)));
    });
    if (active) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
