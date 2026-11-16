import type { ClusterState, MemberState } from "../sim/state";

export interface HudActions {
  restart(members?: number): void;
  killLeader(): void;
  pause(): void;
  resume(): void;
  setTimeScale(scale: number): void;
}

type Tone = "info" | "vote" | "good" | "bad";

const MEMBER_CHOICES = [3, 5, 7];
const SCALE_CHOICES = [1, 2, 3, 5, 10, 20];
const FEED_LIMIT = 6;
const PHONE = "(max-width: 640px)";

const svg = (body: string, attrs = "") => `<svg viewBox="0 0 24 24" aria-hidden="true" ${attrs}>${body}</svg>`;
const crown = svg(`<path d="M4 17.5h16l1.2-9-4.9 3.6L12 5.5l-4.3 6.6-4.9-3.6z"/><rect x="4" y="18.8" width="16" height="1.7" rx=".85"/>`);
const circle = svg(
  `<circle cx="12" cy="12" r="8.5" fill="none" stroke-width="1.4"/><circle cx="12" cy="12" r="5" fill="none" stroke-width="1" stroke-dasharray="2 2.2"/><path d="M12 8.6l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" stroke="none"/>`,
);
const ring = svg(
  `<circle cx="12" cy="12" r="8" fill="none" stroke-width="3" class="track"/><circle cx="12" cy="12" r="8" fill="none" stroke-width="3" stroke-dasharray="34 60" stroke-linecap="round" transform="rotate(-90 12 12)"/>`,
);
const envelope = svg(
  `<rect x="3.5" y="6.5" width="17" height="11.5" rx="2.2" fill="none" stroke-width="1.5"/><path d="M4.5 8l7.5 5.4L19.5 8" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
);
const heart = svg(
  `<path d="M12 19.5s-6.6-4-8.3-8C2.4 8.4 4.2 5.5 7.2 5.5c1.9 0 3.1 1 3.8 2.1h2c.7-1.1 1.9-2.1 3.8-2.1 3 0 4.8 2.9 3.5 6-1.7 4-8.3 8-8.3 8z"/>`,
);
const dot = svg(`<circle cx="12" cy="12" r="5"/>`);
const hollow = svg(`<circle cx="12" cy="12" r="5" fill="none" stroke-width="1.6"/>`);
const pulse = svg(`<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5" fill="none" stroke-width="1.3" opacity=".6"/>`);
const chevron = svg(`<path d="M6.5 9.5l5.5 5.5 5.5-5.5" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);

const ROLE_TEXT: Record<string, string> = { leader: "隊長", candidate: "候選人", follower: "追隨者", down: "停止" };

function memberKind(m: MemberState): string {
  return m.alive ? m.role.toLowerCase() : "down";
}

/** The HTML overlay: cluster stats, member roster, controls, legend and an event feed. */
export class Hud {
  private readonly term: HTMLElement;
  private readonly leader: HTMLElement;
  private readonly alive: HTMLElement;
  private readonly majority: HTMLElement;
  private readonly conn: HTMLElement;
  private readonly roster: HTMLElement;
  private readonly feedCard: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly sizeButtons: HTMLButtonElement[] = [];
  private readonly killLeaderBtn: HTMLButtonElement;
  private readonly scaleButtons: HTMLButtonElement[] = [];
  private readonly pauseBtn: HTMLButtonElement;
  private readonly feedToggle: HTMLButtonElement;
  private readonly legendToggle: HTMLButtonElement;
  private readonly sourceText: HTMLElement;
  private readonly sourceLabel: string;
  private lastKey = "";
  /** The paused state of the last clock event; the pause button acts on it. */
  private paused = false;

  constructor(root: HTMLElement, sourceLabel: string, actions: HudActions) {
    root.innerHTML = `
      <section class="panel title-card">
        <header class="masthead">
          <h1>Quorum<span>Kitties</span></h1>
          <p class="subtitle">Raft leader election · 每位成員就是一個節點</p>
        </header>
        <div class="rule" aria-hidden="true"><i></i></div>
        <dl class="stats">
          <div><dt>任期 Term</dt><dd data-k="term">0</dd></div>
          <div><dt>隊長 Leader</dt><dd data-k="leader">—</dd></div>
          <div><dt>運作中</dt><dd data-k="alive">0 / 0</dd></div>
          <div><dt>過半門檻</dt><dd data-k="majority">0 票</dd></div>
        </dl>
        <ul class="roster" data-k="roster" aria-label="成員狀態"></ul>
        <div class="controls">
          <span class="ctl-label" aria-hidden="true">成員數</span>
          <div class="segmented" role="group" aria-label="成員數量">
            ${MEMBER_CHOICES.map((n) => `<button type="button" data-n="${n}" aria-label="${n} 位成員">${n}</button>`).join("")}
          </div>
          <span class="spacer"></span>
          <button type="button" class="btn" data-action="restart">重新開局</button>
          <button type="button" class="btn btn-primary" data-action="kill-leader">讓隊長下線</button>
        </div>
        <div class="controls">
          <span class="ctl-label" aria-hidden="true">慢動作</span>
          <div class="segmented" role="group" aria-label="慢動作">
            ${SCALE_CHOICES.map((n) => `<button type="button" data-scale="${n}">${n}×</button>`).join("")}
          </div>
          <span class="spacer"></span>
          <button type="button" class="btn" data-action="pause" aria-pressed="false">暫停</button>
        </div>
        <p class="conn" data-k="conn"><i></i><span data-k="source"></span></p>
      </section>
      <div class="dock">
        <section class="panel feed" data-k="feed-card" aria-label="事件紀錄">
          <header class="panel-head">
            <h2>事件紀錄</h2>
            <button type="button" class="chip-btn legend-toggle" data-action="legend" aria-expanded="false" aria-controls="hud-legend">圖例</button>
            <button type="button" class="chip-btn icon feed-toggle" data-action="feed" aria-expanded="true" aria-controls="hud-feed" aria-label="展開或收合事件紀錄">${chevron}</button>
          </header>
          <ul class="feed-list" id="hud-feed" data-k="feed" aria-live="polite"></ul>
        </section>
        <section class="panel legend" id="hud-legend" data-k="legend" aria-label="圖例">
          <h2>圖例</h2>
          <div class="legend-cols">
            <ul>
              <li><span class="ico ico-leader">${crown}</span>隊長</li>
              <li><span class="ico ico-candidate">${circle}</span>候選人</li>
              <li><span class="ico ico-follower">${ring}</span>選舉倒數（沒有隊長時）</li>
              <li><span class="ico ico-down">${hollow}</span>停止</li>
            </ul>
            <ul>
              <li><span class="ico ico-ask">${envelope}</span>拉票 RequestVote</li>
              <li><span class="ico ico-yes">${heart}</span>投你一票</li>
              <li><span class="ico ico-no">${dot}</span>不投給你</li>
              <li><span class="ico ico-beat">${pulse}</span>心跳 Heartbeat</li>
            </ul>
          </div>
          <p class="tip">點一下成員讓它下線 · 拖曳旋轉視角</p>
        </section>
      </div>
    `;
    const q = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
    this.term = q("term");
    this.leader = q("leader");
    this.alive = q("alive");
    this.majority = q("majority");
    this.conn = q("conn");
    this.roster = q("roster");
    this.feedCard = q("feed-card");
    this.feed = q("feed");
    this.legend = q("legend");
    this.sourceText = q("source");
    this.sourceLabel = sourceLabel;
    this.sourceText.textContent = sourceLabel; // Until the first clock event

    root.querySelectorAll<HTMLButtonElement>("[data-n]").forEach((b) => {
      this.sizeButtons.push(b);
      b.addEventListener("click", () => actions.restart(Number(b.dataset.n)));
    });
    root.querySelector('[data-action="restart"]')!.addEventListener("click", () => actions.restart());
    this.killLeaderBtn = root.querySelector('[data-action="kill-leader"]')!;
    this.killLeaderBtn.addEventListener("click", () => actions.killLeader());

    // The clock controls change nothing here on click: the HUD follows clock events only,
    // so every viewer of a shared session shows the same state.
    root.querySelectorAll<HTMLButtonElement>("[data-scale]").forEach((b) => {
      this.scaleButtons.push(b);
      b.addEventListener("click", () => actions.setTimeScale(Number(b.dataset.scale)));
    });
    this.pauseBtn = root.querySelector('[data-action="pause"]')!;
    this.pauseBtn.addEventListener("click", () => (this.paused ? actions.resume() : actions.pause()));

    // The feed starts collapsed to its latest line on phones; the legend is a pop-up there.
    this.feedToggle = root.querySelector('[data-action="feed"]')!;
    this.legendToggle = root.querySelector('[data-action="legend"]')!;
    this.setFeedOpen(!window.matchMedia(PHONE).matches);
    this.feedToggle.addEventListener("click", () => this.setFeedOpen(this.feedCard.classList.contains("collapsed")));
    this.legendToggle.addEventListener("click", () => this.setLegendOpen(!this.legend.classList.contains("open")));
  }

  private setFeedOpen(open: boolean) {
    this.feedCard.classList.toggle("collapsed", !open);
    this.feedToggle.setAttribute("aria-expanded", String(open));
  }

  private setLegendOpen(open: boolean) {
    this.legend.classList.toggle("open", open);
    this.legendToggle.setAttribute("aria-expanded", String(open));
  }

  /** Shows the state of a clock event. */
  setClock(paused: boolean, timeScale: number) {
    this.paused = paused;
    this.pauseBtn.textContent = paused ? "繼續" : "暫停";
    this.pauseBtn.setAttribute("aria-pressed", String(paused));
    this.scaleButtons.forEach((b) => b.classList.toggle("active", Number(b.dataset.scale) === timeScale));
    this.sourceText.textContent = `${this.sourceLabel}${paused ? " · 已暫停" : ""} · 慢動作 ${timeScale}x`;
  }

  setConnected(connected: boolean) {
    this.conn.classList.toggle("offline", !connected);
    this.conn.title = connected ? "已連線" : "連線中斷";
  }

  update(state: ClusterState) {
    const leader = state.leader;
    const kinds = state.members.map(memberKind);
    const key = `${state.term}|${leader?.id}|${kinds.join(",")}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.term.textContent = String(state.term);
    if (leader) {
      this.leader.innerHTML = `<span class="crown">${crown}</span>成員 ${leader.id}`;
    } else {
      this.leader.textContent = state.aliveCount ? "選舉中…" : "—";
    }
    this.leader.classList.toggle("pending", !leader);
    this.alive.textContent = `${state.aliveCount} / ${state.size}`;
    this.majority.textContent = `${state.majority} 票`;
    this.alive.classList.toggle("warn", state.aliveCount < state.majority);
    this.killLeaderBtn.disabled = !leader;
    this.sizeButtons.forEach((b) => b.classList.toggle("active", Number(b.dataset.n) === state.size));

    this.roster.innerHTML = kinds
      .map((kind, id) => `<li class="${kind}" title="成員 ${id} · ${ROLE_TEXT[kind]}"><b>${id}</b><span>${ROLE_TEXT[kind]}</span></li>`)
      .join("");
  }

  log(text: string, tone: Tone = "info") {
    const li = document.createElement("li");
    li.className = tone;
    li.textContent = text;
    this.feed.prepend(li);
    while (this.feed.children.length > FEED_LIMIT) this.feed.lastElementChild!.remove();
  }
}
