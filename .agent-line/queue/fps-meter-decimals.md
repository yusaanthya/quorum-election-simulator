---
id: fps-meter-decimals
status: ready
created: 2026-11-25T00:13:00+08:00
dependsOn: []
merge: runner
---
## Goal

The `?fps` readout in `web/src/ui/fps.ts` prints the frame rate with
`toFixed(0)`, so a slow frame rate reads as `0 fps` or `1 fps` and hides how
slow it is (software rendering, a throttled tab). Show one decimal below 10
fps and whole numbers otherwise.

## Acceptance criteria

- `web/src/ui/fps.ts` exports a pure function `formatFps(fps: number): string`,
  and `createFpsMeter` uses it for the fps part of its text. The ms part and the
  ` fps · ` separators of `el.textContent` are unchanged.
- `formatFps` returns one decimal when the value rounds to less than 10 at one
  decimal (`4.6` gives `"4.6"`, `0.2` gives `"0.2"`, `9.94` gives `"9.9"`) and
  a whole number otherwise (`10` gives `"10"`, `59.7` gives `"60"`, `9.96`
  gives `"10"`, never `"10.0"`).
- A new `scripts/fps-meter.test.mjs` (node:test, the style of
  `scripts/web-state.test.mjs`) imports `web/src/ui/fps.ts` directly through
  Node's TypeScript type stripping, with no DOM and no build step. That works
  because `fps.ts` has no imports and touches `document` only inside
  `createFpsMeter`; keep it that way. The test covers `4.6`, `0.2`, `59.7`,
  `10`, `9.96` and `0`.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- The ms readout, the update interval, the one second window, and the position
  or styling of `.fps-meter`.
- Any change to when `createFpsMeter` is called.
