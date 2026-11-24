/** Formats a frame rate: one decimal when it rounds below 10 at one decimal, a whole number otherwise. */
export function formatFps(fps: number): string {
  const oneDecimal = fps.toFixed(1);
  return Number(oneDecimal) < 10 ? oneDecimal : fps.toFixed(0);
}

/** Frame-rate readout for `?fps`: average fps and frame time over the last second, refreshed twice a second. */
export function createFpsMeter(): (now: number) => void {
  const el = document.createElement("div");
  el.className = "fps-meter";
  document.body.appendChild(el);
  let frames = 0;
  let since = 0;
  let shown = 0;
  return (now) => {
    if (!since) since = shown = now;
    frames++;
    if (now - shown < 500) return;
    // Keep a ~1 s window: the counters restart once they span a second.
    const span = now - since;
    el.textContent = `${formatFps((frames * 1000) / span)} fps · ${(span / frames).toFixed(1)} ms`;
    shown = now;
    if (span >= 1000) {
      frames = 0;
      since = now;
    }
  };
}
