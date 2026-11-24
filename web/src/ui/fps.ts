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
    el.textContent = `${((frames * 1000) / span).toFixed(0)} fps · ${(span / frames).toFixed(1)} ms`;
    shown = now;
    if (span >= 1000) {
      frames = 0;
      since = now;
    }
  };
}
