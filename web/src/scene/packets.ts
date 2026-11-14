import * as THREE from "three";
import type { MessageKind } from "../sim/events";
import { palette } from "./palette";
import { heartGeometry, starGeometry } from "./shapes";

interface Style {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  size: number;
  duration: number; // Seconds in flight when the simulation reports no delay
  arc: number; // Arc height per unit of distance
  spin: number;
}

interface Packet {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  age: number;
  duration: number;
  style: Style;
  onArrive?: () => void;
}

const sphere = new THREE.SphereGeometry(1, 16, 12);
const glossy = (color: string, emissive = 0.3) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: emissive });

/** Messages flying between beans: stars ask for votes, hearts grant them, mint bubbles are heartbeats. */
export class PacketSystem {
  private readonly packets: Packet[] = [];
  private readonly styles: Record<string, Style>;

  constructor(private readonly scene: THREE.Scene) {
    const star = starGeometry();
    const heart = heartGeometry();
    this.styles = {
      request_vote: { geometry: star, material: glossy(palette.requestVote, 0.4), size: 0.2, duration: 0.75, arc: 0.28, spin: 5 },
      vote_yes: { geometry: heart, material: glossy(palette.voteYes, 0.35), size: 0.2, duration: 0.75, arc: 0.22, spin: 0 },
      vote_no: { geometry: sphere, material: glossy(palette.voteNo, 0.1), size: 0.1, duration: 0.75, arc: 0.18, spin: 0 },
      heartbeat: { geometry: sphere, material: glossy(palette.heartbeat, 0.45), size: 0.11, duration: 0.55, arc: 0.12, spin: 0 },
      heartbeat_reply: {
        geometry: sphere,
        material: new THREE.MeshBasicMaterial({ color: palette.heartbeatReply, transparent: true, opacity: 0.75 }),
        size: 0.06,
        duration: 0.5,
        arc: 0.08,
        spin: 0,
      },
    };
  }

  /** Launches a message; it lands after durationMs, the delay the simulation applies to it. */
  spawn(kind: MessageKind, granted: boolean, durationMs: number, from: THREE.Vector3, to: THREE.Vector3, onArrive?: () => void) {
    const key = kind === "vote_reply" ? (granted ? "vote_yes" : "vote_no") : kind;
    const style = this.styles[key];
    if (!style) return;
    const mesh = new THREE.Mesh(style.geometry, style.material);
    mesh.position.copy(from);
    mesh.scale.setScalar(0);
    mesh.castShadow = style.size > 0.1;
    this.scene.add(mesh);
    const duration = durationMs > 0 ? durationMs / 1000 : style.duration;
    this.packets.push({ mesh, from: from.clone(), to: to.clone(), age: 0, duration, style, onArrive });
  }

  clear() {
    for (const p of this.packets) this.scene.remove(p.mesh);
    this.packets.length = 0;
  }

  update(dt: number, camera: THREE.Camera) {
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      p.age += dt;
      const k = Math.min(1, p.age / p.duration);
      const e = easeInOut(k);
      const dist = p.from.distanceTo(p.to);
      p.mesh.position.lerpVectors(p.from, p.to, e);
      p.mesh.position.y += Math.sin(Math.PI * e) * dist * p.style.arc;

      // Pop in, travel, shrink into the receiver.
      const grow = Math.min(1, k * 6) * (k > 0.85 ? 1 - (k - 0.85) / 0.15 * 0.6 : 1);
      p.mesh.scale.setScalar(p.style.size * grow);
      if (p.style.geometry !== sphere) {
        // Keep stars and hearts facing the viewer so their shape reads.
        p.mesh.lookAt(camera.position);
        if (p.style.spin) p.mesh.rotateZ(p.age * p.style.spin);
      }

      if (k >= 1) {
        this.scene.remove(p.mesh);
        this.packets.splice(i, 1);
        p.onArrive?.();
      }
    }
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
