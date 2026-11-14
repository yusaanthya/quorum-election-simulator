// Dev-only page for comparing scenery themes: `npm run dev`, then open /concepts.html?theme=academy.
import "./style.css";
import * as THREE from "three";
import { Mochi } from "./scene/mochi";
import { PacketSystem } from "./scene/packets";
import { Stage } from "./scene/stage";
import type { Role } from "./sim/events";
import type { MemberState } from "./sim/state";
import { academy } from "./scenery/academy";
import { forest } from "./scenery/forest";
import { lineup } from "./scenery/lineup";
import type { Theme } from "./scenery/kit";
import { sky } from "./scenery/sky";

const params = new URLSearchParams(location.search);
const themes: Record<string, Theme> = { academy, forest, sky, lineup };
const theme = themes[params.get("theme") ?? "academy"] ?? academy;
document.getElementById("caption")!.innerHTML =
  theme === lineup
    ? `${theme.title} · 圓角貓貓<small>由左到右：追隨者 · 候選人 · 隊長 · 追隨者 · 停止</small>`
    : `${theme.title}<small>Raft 選舉場景示意 · 隊長 / 候選人 / 追隨者 / 停止</small>`;

const stage = new Stage(document.getElementById("scene")!, {
  ambientOcclusion: true,
  scenery: (scene) => theme.build(scene),
  background: theme.background,
  reserveHud: false,
});
if (theme === lineup && params.get("focus") === "leader") {
  stage.camera.position.set(0, 1.9, 3.4);
  stage.controls.target.set(0, 0.95, 0);
  stage.controls.minDistance = 1.5;
  stage.controls.update();
} else if (theme === lineup) {
  stage.camera.position.set(0, 2.6, 8.4);
  stage.controls.target.set(0, 0.6, 0);
  stage.controls.minDistance = 3;
  stage.controls.update();
} else if (params.get("focus") === "center") {
  stage.camera.position.set(3.2, 5.2, 4.6);
  stage.controls.target.set(0, 0, 0);
  stage.controls.minDistance = 2;
  stage.controls.update();
} else {
  stage.camera.position.multiplyScalar(0.84);
}
const packets = new PacketSystem(stage.scene);

// A frozen moment: member 0 leads, member 2 campaigns, member 4 has stopped.
const roles: (Role | "Down")[] =
  theme === lineup
    ? ["Follower", "Candidate", "Leader", "Follower", "Down"]
    : ["Leader", "Follower", "Candidate", "Follower", "Down"];
const now = performance.now();
const members: MemberState[] = roles.map((r, id) => ({
  id,
  role: r === "Down" ? "Follower" : r,
  term: 3,
  leaderId: 0,
  failures: 0,
  alive: r !== "Down",
  halted: false,
  timerStart: (r === "Follower" || r === "Candidate") ? now - 600 * id : null,
  timerDurationMs: 6000,
}));
const mochis = members.map((m, i) => {
  const mochi = new Mochi(m.id);
  theme.dress?.(mochi);
  theme.onRole?.(mochi, roles[i]);
  if (theme.layout) {
    const [x, z] = theme.layout(i, members.length);
    mochi.root.position.set(x, 0, z);
  } else {
    const a = (i / members.length) * Math.PI * 2 + 0.35;
    mochi.root.position.set(Math.sin(a) * theme.standRadius, 0, Math.cos(a) * theme.standRadius);
  }
  stage.scene.add(mochi.root);
  return mochi;
});

const from = new THREE.Vector3();
const to = new THREE.Vector3();
const cand = roles.indexOf("Candidate");
const lead = roles.indexOf("Leader");
const followers = roles.flatMap((r, i) => (r === "Follower" ? [i] : []));
function send() {
  if (theme === lineup) return; // Keep the close-up uncluttered
  for (const peer of [lead, ...followers]) packets.spawn("request_vote", false, 1800, mochis[cand].anchor(from), mochis[peer].anchor(to));
  packets.spawn("vote_reply", true, 1800, mochis[followers[0]].anchor(from), mochis[cand].anchor(to));
  for (const peer of followers) packets.spawn("heartbeat", false, 1400, mochis[lead].anchor(from), mochis[peer].anchor(to));
}
send();
setInterval(send, 1300);

const timer = new THREE.Timer();
renderLoop();
function renderLoop(time?: number) {
  requestAnimationFrame(renderLoop);
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();
  stage.update();
  theme.animate?.(t, dt);
  // Freeze the countdown rings partway so the still shows them.
  mochis.forEach((m, i) => m.update(dt, t, members[i], now + 1500, stage.camera.position));
  packets.update(dt, stage.camera);
  stage.render();
}
