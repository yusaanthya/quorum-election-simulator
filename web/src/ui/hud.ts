import type { ClusterState } from "../sim/state";

export interface HudActions {
  restart(members?: number): void;
  killLeader(): void;
}

const MEMBER_CHOICES = [3, 5, 7];
const FEED_LIMIT = 6;

const star = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
const heart = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>`;
const dot = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg>`;
const ring = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke-width="4" stroke-dasharray="36 60" stroke-linecap="round" transform="rotate(-90 12 12)"/></svg>`;

/** The HTML overlay: cluster stats, controls, legend and an event feed. */
export class Hud {
  private readonly term: HTMLElement;
  private readonly leader: HTMLElement;
  private readonly alive: HTMLElement;
  private readonly majority: HTMLElement;
  private readonly conn: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly sizeButtons: HTMLButtonElement[] = [];
  private readonly killLeaderBtn: HTMLButtonElement;
  private readonly sourceText: HTMLElement;
  private readonly sourceLabel: string;
  private lastKey = "";

  constructor(root: HTMLElement, sourceLabel: string, timeScale: number | null, actions: HudActions) {
    root.innerHTML = `
      <section class="card title-card">
        <h1>Bean Quorum <span>豆豆選舉</span></h1>
        <p class="subtitle">Raft leader election，一顆豆豆就是一個節點</p>
        <dl class="stats">
          <div><dt>任期 Term</dt><dd data-k="term">0</dd></div>
          <div><dt>隊長 Leader</dt><dd data-k="leader">—</dd></div>
          <div><dt>還醒著</dt><dd data-k="alive">0 / 0</dd></div>
          <div><dt>過半門檻</dt><dd data-k="majority">0 票</dd></div>
        </dl>
        <div class="controls">
          <div class="segmented" role="group" aria-label="豆豆數量">
            ${MEMBER_CHOICES.map((n) => `<button type="button" data-n="${n}" aria-label="${n} 顆豆豆">${n}</button>`).join("")}
          </div>
          <button type="button" class="btn" data-action="restart">重新開局</button>
          <button type="button" class="btn btn-pink" data-action="kill-leader">淘汰隊長</button>
        </div>
        <p class="conn" data-k="conn"><i></i><span data-k="source"></span></p>
      </section>
      <ul class="card feed" data-k="feed" aria-live="polite"></ul>
      <section class="card legend">
        <ul>
          <li><span class="ico ico-star">${star}</span>拉票 RequestVote</li>
          <li><span class="ico ico-heart">${heart}</span>投你一票</li>
          <li><span class="ico ico-no">${dot}</span>不投給你</li>
          <li><span class="ico ico-beat">${dot}</span>心跳 Heartbeat</li>
          <li><span class="ico ico-ring">${ring}</span>選舉倒數計時</li>
        </ul>
        <p class="tip">點一下豆豆就能讓它下線；拖曳可以旋轉視角</p>
      </section>
    `;
    const q = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
    this.term = q("term");
    this.leader = q("leader");
    this.alive = q("alive");
    this.majority = q("majority");
    this.conn = q("conn");
    this.feed = q("feed");
    this.sourceText = q("source");
    this.sourceLabel = sourceLabel;
    this.setTimeScale(timeScale);

    root.querySelectorAll<HTMLButtonElement>("[data-n]").forEach((b) => {
      this.sizeButtons.push(b);
      b.addEventListener("click", () => actions.restart(Number(b.dataset.n)));
    });
    root.querySelector('[data-action="restart"]')!.addEventListener("click", () => actions.restart());
    this.killLeaderBtn = root.querySelector('[data-action="kill-leader"]')!;
    this.killLeaderBtn.addEventListener("click", () => actions.killLeader());
  }

  setTimeScale(scale: number | null) {
    this.sourceText.textContent = scale ? `${this.sourceLabel} · 慢動作 ${scale}x` : this.sourceLabel;
  }

  setConnected(connected: boolean) {
    this.conn.classList.toggle("offline", !connected);
  }

  update(state: ClusterState) {
    const leader = state.leader;
    const key = `${state.term}|${leader?.id}|${state.aliveCount}|${state.size}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.term.textContent = String(state.term);
    this.leader.textContent = leader ? `豆豆 ${leader.id} 👑` : state.aliveCount ? "選舉中…" : "—";
    this.alive.textContent = `${state.aliveCount} / ${state.size}`;
    this.majority.textContent = `${state.majority} 票`;
    this.alive.classList.toggle("warn", state.aliveCount < state.majority);
    this.killLeaderBtn.disabled = !leader;
    this.sizeButtons.forEach((b) => b.classList.toggle("active", Number(b.dataset.n) === state.size));
  }

  log(text: string, tone: "info" | "good" | "bad" = "info") {
    const li = document.createElement("li");
    li.className = tone;
    li.textContent = text;
    this.feed.prepend(li);
    while (this.feed.children.length > FEED_LIMIT) this.feed.lastElementChild!.remove();
  }
}
