import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { MessageKind } from "../sim/events";
import { palette } from "./palette";
import { heartGeometry } from "./shapes";

interface Style {
  make: () => THREE.Object3D;
  duration: number; // Seconds in flight when the simulation reports no delay
  arc: number; // Arc height per unit of distance
  faceCamera: boolean;
}

interface Packet {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  age: number;
  duration: number;
  style: Style;
  onArrive?: () => void;
}

const matte = (color: string, emissive = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive: color, emissiveIntensity: emissive });

/** Small messages crossing the deck: letters ask for votes, hearts grant them, pebbles refuse, dots are heartbeats. */
export class PacketSystem {
  private readonly packets: Packet[] = [];
  private readonly styles: Record<string, Style>;

  constructor(private readonly scene: THREE.Scene) {
    const envelope = new RoundedBoxGeometry(0.26, 0.18, 0.05, 2, 0.022);
    const seal = new THREE.CircleGeometry(0.035, 16);
    const heart = heartGeometry();
    const dot = new THREE.SphereGeometry(1, 16, 12);
    const mats = {
      envelope: matte(palette.envelope, 0.05),
      seal: matte(palette.seal),
      yes: matte(palette.voteYes, 0.08),
      no: matte(palette.voteNo),
      beat: matte(palette.heartbeat, 0.25),
      reply: new THREE.MeshBasicMaterial({ color: palette.heartbeatReply, transparent: true, opacity: 0.7 }),
    };
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, scale: number | [number, number, number]) => () => {
      const o = new THREE.Mesh(g, m);
      if (Array.isArray(scale)) o.scale.set(...scale);
      else o.scale.setScalar(scale);
      o.castShadow = true;
      return o;
    };
    this.styles = {
      request_vote: {
        make: () => {
          const g = new THREE.Group();
          const body = new THREE.Mesh(envelope, mats.envelope);
          body.castShadow = true;
          const s = new THREE.Mesh(seal, mats.seal);
          s.position.z = 0.027;
          g.add(body, s);
          return g;
        },
        duration: 0.8,
        arc: 0.22,
        faceCamera: true,
      },
      vote_yes: { make: mesh(heart, mats.yes, 0.13), duration: 0.8, arc: 0.2, faceCamera: true },
      vote_no: { make: mesh(dot, mats.no, [0.07, 0.045, 0.07]), duration: 0.8, arc: 0.16, faceCamera: false },
      heartbeat: { make: mesh(dot, mats.beat, 0.055), duration: 0.6, arc: 0.1, faceCamera: false },
      heartbeat_reply: { make: mesh(dot, mats.reply, 0.032), duration: 0.5, arc: 0.07, faceCamera: false },
    };
  }

  /** Launches a message; it lands after durationMs, the delay the simulation applies to it. */
  spawn(kind: MessageKind, granted: boolean, durationMs: number, from: THREE.Vector3, to: THREE.Vector3, onArrive?: () => void) {
    const key = kind === "vote_reply" ? (granted ? "vote_yes" : "vote_no") : kind;
    const style = this.styles[key];
    if (!style) return;
    const obj = style.make();
    obj.position.copy(from);
    obj.userData.base = obj.scale.clone();
    obj.scale.setScalar(0);
    this.scene.add(obj);
    const duration = durationMs > 0 ? durationMs / 1000 : style.duration;
    this.packets.push({ obj, from: from.clone(), to: to.clone(), age: 0, duration, style, onArrive });
  }

  clear() {
    for (const p of this.packets) this.scene.remove(p.obj);
    this.packets.length = 0;
  }

  update(dt: number, camera: THREE.Camera) {
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      p.age += dt;
      const k = Math.min(1, p.age / p.duration);
      const e = easeInOut(k);
      const dist = p.from.distanceTo(p.to);
      p.obj.position.lerpVectors(p.from, p.to, e);
      p.obj.position.y += Math.sin(Math.PI * e) * dist * p.style.arc;

      const grow = Math.min(1, k * 5) * (k > 0.85 ? 1 - ((k - 0.85) / 0.15) * 0.7 : 1);
      p.obj.scale.copy(p.obj.userData.base as THREE.Vector3).multiplyScalar(grow);
      if (p.style.faceCamera) {
        p.obj.lookAt(camera.position);
        p.obj.rotateZ(Math.sin(p.age * 6) * 0.25); // A light flutter
      }

      if (k >= 1) {
        this.scene.remove(p.obj);
        this.packets.splice(i, 1);
        p.onArrive?.();
      }
    }
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
