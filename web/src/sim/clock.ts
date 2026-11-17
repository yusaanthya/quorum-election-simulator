import type { SimEvent } from "./events";

/**
 * The page's mirror of the simulation clock, and the only place the page keeps simulated
 * time. It integrates wall time under the state the last "clock" event announced; it never
 * receives a simulated timestamp, so it is advanced to performance.now() before every use.
 */
export class SimClock {
  paused = false;
  /** The chosen factor: wall time divided by simulated time. */
  timeScale = 1;
  /** Simulated milliseconds elapsed locally. */
  now = 0;
  private lastWallMs: number | null = null;

  /** Adds the wall time since the previous call, divided by the factor, unless paused. */
  advance(wallNowMs: number): void {
    if (this.lastWallMs !== null && !this.paused) {
      this.now += (wallNowMs - this.lastWallMs) / this.timeScale;
    }
    this.lastWallMs = wallNowMs;
  }

  /** Takes the state of a "clock" event. */
  apply(e: SimEvent): void {
    if (e.type !== "clock") return;
    this.paused = e.paused;
    this.timeScale = e.timeScale;
  }
}
