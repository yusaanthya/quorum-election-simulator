import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-800.css";
import "./style.css";
import * as THREE from "three";
import { Bean } from "./scene/bean";
import { Confetti } from "./scene/confetti";
import { PacketSystem } from "./scene/packets";
import { Stage } from "./scene/stage";
import type { SimEvent } from "./sim/events";
import { ServerSource, WasmSource, type SimSource } from "./sim/source";
import { ClusterState } from "./sim/state";
import { Hud } from "./ui/hud";

const params = new URLSearchParams(location.search);
const wasmMode = import.meta.env.MODE === "wasm";
const timeScale = clampNumber(params.get("slowmo"), 1, 10, 3);
const source: SimSource = wasmMode
  ? new WasmSource({ members: clampNumber(params.get("members"), 1, 9, 5), timeScale })
  : new ServerSource();

const stage = new Stage(document.getElementById("scene")!);
const state = new ClusterState();
const packets = new PacketSystem(stage.scene);
const confetti = new Confetti(stage.scene);
let beans: Bean[] = [];

const hud = new Hud(document.getElementById("hud")!, source.label, wasmMode ? timeScale : null, {
  restart: (n) => source.restart(n),
  killLeader: () => {
    const leader = state.leader;
    if (leader) source.kill(leader.id);
  },
});

const from = new THREE.Vector3();
const to = new THREE.Vector3();

function rebuild(n: number) {
  for (const b of beans) {
    stage.scene.remove(b.root);
    b.dispose();
  }
  packets.clear();
  beans = Array.from({ length: n }, (_, id) => {
    const bean = new Bean(id);
    // Member 0 stands nearest the camera, the rest go around the circle.
    const radius = n === 1 ? 0 : 2.4 + n * 0.32;
    const a = (id / n) * Math.PI * 2;
    bean.root.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    stage.scene.add(bean.root);
    return bean;
  });
}

function onEvent(e: SimEvent) {
  if (state.apply(e, performance.now())) {
    rebuild(state.size);
    hud.log(`🎉 開局：${e.members} 顆豆豆上場`, "good");
    return;
  }
  const bean = beans[e.member];
  if (!bean) return;

  switch (e.type) {
    case "message": {
      const target = beans[e.peer];
      if (target && e.message) {
        packets.spawn(e.message, e.granted, e.durationMs, bean.chest(from), target.chest(to), () => target.receive());
      }
      break;
    }
    case "election_started":
      hud.log(`🗳️ 豆豆 ${e.member} 發起選舉（Term ${e.term}）`);
      break;
    case "vote_granted":
      hud.log(`💗 豆豆 ${e.member} 投給豆豆 ${e.peer}`);
      break;
    case "became_leader":
      hud.log(`👑 豆豆 ${e.member} 拿到 ${e.votes} 票，當選隊長！`, "good");
      confetti.burst(bean.root.getWorldPosition(from).setY(2.2));
      break;
    case "lost_quorum":
      hud.log(`😵 豆豆 ${e.member} 聯絡不到過半成員，只好退位`, "bad");
      break;
    case "halted":
      hud.log(`💤 豆豆 ${e.member} 選輸太多次，累倒了`, "bad");
      break;
    case "stopped":
      if (!state.members[e.member]?.halted) hud.log(`🫥 豆豆 ${e.member} 下線了`, "bad");
      break;
    case "quorum_ended":
      hud.log("所有豆豆都倒下了，等一下自動重新開局…", "bad");
      break;
  }
}

// Clicking a bean stops it; a drag that rotates the camera does not count.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt: { x: number; y: number } | null = null;
let hovered: Bean | null = null;

function pick(ev: PointerEvent): Bean | null {
  const rect = stage.renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, stage.camera);
  const hit = raycaster.intersectObjects(beans.map((b) => b.hitMesh), false)[0];
  return hit ? (beans[hit.object.userData.memberId as number] ?? null) : null;
}

const canvas = stage.renderer.domElement;
canvas.addEventListener("pointerdown", (ev) => (downAt = { x: ev.clientX, y: ev.clientY }));
canvas.addEventListener("pointerup", (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 6) return;
  const bean = pick(ev);
  if (bean && state.members[bean.id]?.alive) source.kill(bean.id);
});
canvas.addEventListener("pointermove", (ev) => {
  if (ev.pointerType !== "mouse") return;
  const bean = pick(ev);
  const target = bean && state.members[bean.id]?.alive ? bean : null;
  if (target !== hovered) {
    hovered?.setHover(false);
    target?.setHover(true);
    hovered = target;
    canvas.style.cursor = target ? "pointer" : "";
  }
});

const timer = new THREE.Timer();
timer.connect(document); // Pauses the clock while the tab is hidden
renderLoop();
function renderLoop(time?: number) {
  requestAnimationFrame(renderLoop);
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();
  const now = performance.now();
  stage.update(dt, t);
  beans.forEach((b, i) => {
    const m = state.members[i];
    if (m) b.update(dt, t, m, now, stage.camera.position);
  });
  packets.update(dt, stage.camera);
  confetti.update(dt);
  hud.update(state);
  stage.render();
}

if (!wasmMode) {
  fetch("/api/config")
    .then((r) => r.json())
    .then((cfg: { timeScale: number }) => hud.setTimeScale(cfg.timeScale))
    .catch(() => {});
}

source
  .connect(onEvent, (connected) => hud.setConnected(connected))
  .catch((err) => {
    console.error(err);
    hud.setConnected(false);
    hud.log(`連線失敗：${err instanceof Error ? err.message : err}`, "bad");
  });

function clampNumber(raw: string | null, min: number, max: number, fallback: number) {
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
