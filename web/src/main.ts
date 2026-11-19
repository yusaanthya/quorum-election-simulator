import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-800.css";
import "./style.css";
import * as THREE from "three";
import { Mochi } from "./scene/mochi";
import { PacketSystem } from "./scene/packets";
import { Sparkles } from "./scene/sparkles";
import { Stage } from "./scene/stage";
import { academy } from "./scenery/academy";
import { standAt, type Theme } from "./scenery/kit";
import { SimClock } from "./sim/clock";
import type { Role, SimEvent } from "./sim/events";
import { ServerSource, WasmSource, type SimSource } from "./sim/source";
import { ClusterState } from "./sim/state";
import { Hud } from "./ui/hud";

const params = new URLSearchParams(location.search);
const wasmMode = import.meta.env.MODE === "wasm";
const timeScale = clampNumber(params.get("slowmo"), 1, 20, 3);
const source: SimSource = wasmMode
  ? new WasmSource({ members: clampNumber(params.get("members"), 1, 9, 5), timeScale })
  : new ServerSource();

// Ambient occlusion is the costliest pass; skip it on small screens or with ?ao=0.
const ambientOcclusion = params.get("ao") !== "0" && window.innerWidth >= 640;
const theme: Theme = academy;
const sceneEl = document.getElementById("scene")!;
/** Matches the phone layout of style.css, where the title card and the dock span the screen. */
const phoneLayout = window.matchMedia("(max-width: 640px)");
/**
 * The gap between the title card and the feed, in which phone screens center the stage. The
 * feed counts at its collapsed height, so expanding it does not move the scene.
 */
function freeBand() {
  if (!phoneLayout.matches) return null;
  const card = document.querySelector(".title-card");
  const feed = document.querySelector(".feed");
  if (!card || !feed) return null;
  const origin = sceneEl.getBoundingClientRect().top;
  return {
    top: card.getBoundingClientRect().bottom - origin,
    bottom: feed.getBoundingClientRect().bottom - origin - collapsedHeight(feed),
  };
}
/**
 * Measures a hidden collapsed copy of the feed beside it, so the answer holds also while the
 * feed is open (as after turning a phone from landscape), and the feed's own rows do not
 * replay their entry animation as toggling its class would.
 */
function collapsedHeight(feed: Element) {
  const probe = feed.cloneNode(true) as HTMLElement;
  probe.classList.add("collapsed");
  probe.removeAttribute("aria-label");
  probe.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  probe.style.cssText = "position: absolute; left: 0; right: 0; bottom: 0; visibility: hidden";
  feed.parentElement!.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}
const stage = new Stage(sceneEl, {
  freeBand,
  ambientOcclusion,
  scenery: (scene) => theme.build(scene),
  background: theme.background,
  lighting: theme.lighting,
  bloom: theme.bloom,
});
const state = new ClusterState();
/** Simulated time for countdown rings and packet flights; everything else runs on wall time. */
const simClock = new SimClock();
const packets = new PacketSystem(stage.scene, theme.keepClear);
const sparkles = new Sparkles(stage.scene);
let beans: Mochi[] = [];
/** The role each member last showed, so the theme hears about changes once. */
let shownRoles: (Role | "Down" | null)[] = [];

const hud = new Hud(document.getElementById("hud")!, source.label, {
  restart: (n) => source.restart(n),
  killLeader: () => {
    const leader = state.leader;
    if (leader) source.kill(leader.id);
  },
  pause: () => source.pause(),
  resume: () => source.resume(),
  setTimeScale: (scale) => source.setTimeScale(scale),
  setAutoSlow: (enabled) => source.setAutoSlow(enabled),
  splitVote: () => source.splitVote(),
});
// The title card is built by the HUD above and changes height with its content; frame the scene again.
new ResizeObserver(() => stage.resize()).observe(document.querySelector(".title-card")!);

const from = new THREE.Vector3();
const to = new THREE.Vector3();

function rebuild(n: number) {
  for (const b of beans) {
    stage.scene.remove(b.root);
    b.dispose();
  }
  packets.clear();
  beans = Array.from({ length: n }, (_, id) => {
    const bean = new Mochi(id, theme.memberLook);
    theme.dress?.(bean);
    const [x, z] = standAt(theme, id, n);
    bean.root.position.set(x, 0, z);
    stage.scene.add(bean.root);
    return bean;
  });
  shownRoles = beans.map(() => null);
}

function onEvent(e: SimEvent) {
  // Integrate the time up to this event under the clock state that was in force, so the
  // event is stamped with the mirror's time at its receipt, also in a hidden tab.
  simClock.advance(performance.now());
  if (e.type === "clock") {
    simClock.apply(e);
    hud.setClock(e.paused, e.timeScale, e.factor, e.autoSlow);
    return;
  }
  if (state.apply(e, simClock.now)) {
    rebuild(state.size);
    hud.log(`新的一局：${e.members} 位成員`, "good");
    return;
  }
  const bean = beans[e.member];
  if (!bean) return;

  switch (e.type) {
    case "message": {
      const target = beans[e.peer];
      // A hidden tab gets no animation frames, so packets spawned there would never
      // expire and would all appear at once when the tab is shown again.
      if (target && e.message && !document.hidden) {
        packets.spawn(e.message, e.granted, e.durationMs, bean.anchor(from), target.anchor(to), simClock.now, () => target.receive());
      }
      break;
    }
    case "election_started":
      hud.log(`成員 ${e.member} 發起選舉 · Term ${e.term}`);
      break;
    case "vote_granted":
      hud.log(`成員 ${e.member} 投給成員 ${e.peer}`, "vote");
      break;
    case "became_leader":
      hud.log(`成員 ${e.member} 以 ${e.votes} 票當選隊長`, "good");
      sparkles.burst(bean.root.getWorldPosition(from));
      break;
    case "lost_quorum":
      hud.log(`成員 ${e.member} 聯絡不到過半成員，退位`, "bad");
      break;
    case "halted":
      hud.log(`成員 ${e.member} 選舉失敗太多次，停止運作`, "bad");
      break;
    case "stopped":
      if (!state.members[e.member]?.halted) hud.log(`成員 ${e.member} 下線`, "bad");
      break;
    case "quorum_ended":
      hud.log("所有成員都停了，稍後自動重新開局", "bad");
      break;
  }
}

// Clicking a bean stops it; a drag that rotates the camera does not count.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt: { x: number; y: number } | null = null;
let hovered: Mochi | null = null;

function pick(ev: PointerEvent): Mochi | null {
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
  simClock.advance(performance.now());
  stage.update();
  theme.animate?.(t, dt);
  beans.forEach((b, i) => {
    const m = state.members[i];
    if (!m) return;
    const role = m.alive ? m.role : "Down";
    if (role !== shownRoles[i]) {
      shownRoles[i] = role;
      theme.onRole?.(b, role);
    }
    b.update(dt, t, m, simClock.now, stage.camera.position, !state.leader);
  });
  packets.update(simClock.now, stage.camera);
  sparkles.update(dt);
  hud.update(state);
  stage.render();
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
