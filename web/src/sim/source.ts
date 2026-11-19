import type { SimEvent } from "./events";

/** Where events come from and where commands go: a Go server, or Go compiled to WebAssembly. */
export interface SimSource {
  readonly label: string;
  connect(onEvent: (e: SimEvent) => void, onStatus: (connected: boolean) => void): Promise<void>;
  kill(id: number): void;
  restart(members?: number): void;
  pause(): void;
  resume(): void;
  setTimeScale(scale: number): void;
  setAutoSlow(enabled: boolean): void;
  /** Makes two members time out together; nothing happens when no two can be paired. */
  splitVote(): void;
}

export interface SourceOptions {
  members: number;
  timeScale: number;
}

/** Streams events from `quorum serve` over Server-Sent Events. EventSource reconnects on its own. */
export class ServerSource implements SimSource {
  readonly label = "本機 Go server";

  async connect(onEvent: (e: SimEvent) => void, onStatus: (connected: boolean) => void) {
    const es = new EventSource("/api/events");
    es.onopen = () => onStatus(true);
    es.onerror = () => onStatus(false);
    es.onmessage = (msg) => onEvent(JSON.parse(msg.data) as SimEvent);
  }

  kill(id: number) {
    void post("/api/kill", { id });
  }

  restart(members?: number) {
    void post("/api/restart", members ? { members } : undefined);
  }

  pause() {
    void post("/api/pause");
  }

  resume() {
    void post("/api/resume");
  }

  setTimeScale(scale: number) {
    void post("/api/timescale", { timeScale: scale });
  }

  setAutoSlow(enabled: boolean) {
    void post("/api/autoslow", { enabled });
  }

  splitVote() {
    void post("/api/split-vote");
  }
}

async function post(path: string, body?: unknown) {
  try {
    await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    console.warn(`POST ${path} failed`, err);
  }
}

interface QuorumSimApi {
  start(opts: SourceOptions, onEvent: (json: string) => void): void;
  kill(id: number): void;
  restart(members: number): void;
  pause(): void;
  resume(): void;
  setTimeScale(scale: number): void;
  setAutoSlow(enabled: boolean): void;
  splitVote(): void;
}

declare global {
  interface Window {
    quorumSim?: QuorumSimApi;
    Go?: new () => { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> };
  }
}

/** Runs the Go simulation in this tab (cmd/wasm), so the site can be hosted statically. */
export class WasmSource implements SimSource {
  readonly label = "瀏覽器 WebAssembly";
  private api?: QuorumSimApi;

  constructor(private readonly opts: SourceOptions) {}

  async connect(onEvent: (e: SimEvent) => void, onStatus: (connected: boolean) => void) {
    const base = import.meta.env.BASE_URL;
    await loadScript(`${base}wasm/wasm_exec.js`);
    if (!window.Go) throw new Error("wasm_exec.js did not define Go");
    const go = new window.Go();

    const ready = new Promise<void>((resolve) => window.addEventListener("quorumsim-ready", () => resolve(), { once: true }));
    const url = `${base}wasm/quorum.wasm`;
    const { instance } = await instantiate(url, go.importObject);
    void go.run(instance); // Resolves only when the Go program exits
    await ready;

    this.api = window.quorumSim;
    if (!this.api) throw new Error("quorum.wasm did not register quorumSim");
    this.api.start(this.opts, (json) => onEvent(JSON.parse(json) as SimEvent));
    onStatus(true);
  }

  kill(id: number) {
    this.api?.kill(id);
  }

  restart(members?: number) {
    this.api?.restart(members ?? 0);
  }

  pause() {
    this.api?.pause();
  }

  resume() {
    this.api?.resume();
  }

  setTimeScale(scale: number) {
    this.api?.setTimeScale(scale);
  }

  setAutoSlow(enabled: boolean) {
    this.api?.setAutoSlow(enabled);
  }

  splitVote() {
    this.api?.splitVote();
  }
}

async function instantiate(url: string, imports: WebAssembly.Imports) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url}: ${resp.status}`);
  if (WebAssembly.instantiateStreaming && resp.headers.get("Content-Type")?.includes("application/wasm")) {
    return WebAssembly.instantiateStreaming(resp, imports);
  }
  return WebAssembly.instantiate(await resp.arrayBuffer(), imports);
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}
