/** Seconds between a candidate's landing and its next takeoff. */
export const HOP_INTERVAL = 1.8;

/**
 * When a cat may take off. Each cat's phase offsets its first takeoff after it
 * becomes a candidate, so cats that enter candidacy together, or re-enter it
 * together, do not hop in step however long they idled before.
 */
export class HopSchedule {
  simT = 0;
  private nextHop: number;
  private wasHopping = false;

  private readonly phase: number;

  constructor(phase: number) {
    this.phase = phase;
    this.nextHop = this.offset();
  }

  private offset() {
    return (this.phase / (Math.PI * 2)) * HOP_INTERVAL;
  }

  /** Advance one substep. Returns true when an idle cat should start a hop. */
  tick(h: number, hopping: boolean, idle: boolean) {
    if (hopping && !this.wasHopping) this.nextHop = this.simT + this.offset();
    this.wasHopping = hopping;
    this.simT += h;
    return idle && hopping && this.simT >= this.nextHop;
  }

  landed() {
    this.nextHop = this.simT + HOP_INTERVAL;
  }
}
