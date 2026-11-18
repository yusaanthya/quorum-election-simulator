---
id: sim-clock-hud-factor
status: ready
created: 2026-11-19T01:31:00+08:00
dependsOn: [sim-clock-pr4]
merge: owner
---
## Goal

The HUD prints the raw floating-point factor. With a fractional chosen
factor, which only the `?slowmo=` URL parameter or the `--slowmo` flag can
give, an election shows `（選舉中 3.3000000000000003x）` for `slowmo=1.1`
(review of #42, finding 3). Round the factors the HUD displays.

## Acceptance criteria

- `HUD.setClock` in `web/src/ui/hud.ts` formats the chosen factor in
  `慢動作 …x` and the effective factor in `（選舉中 …x）` with at most two
  decimals and no trailing zeros: `3.3000000000000003` shows `3.3`, `1.25`
  shows `1.25`, `9` shows `9`. The values it compares and passes on are not
  rounded: the suffix still appears exactly when `factor !== timeScale`, and
  the preset buttons still match on the unrounded `timeScale`.
- The formatting is a small function that `scripts/*.test.mjs` can import
  without a DOM, the way `scripts/web-state.test.mjs` imports
  `web/src/sim/state.ts`. A test covers the three examples above. If such an
  import is not possible without a new dependency or a CI change, the report
  says so and the formatting stays in `hud.ts` without a test.
- With the presets (`1×` to `20×`) the HUD text is unchanged.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- How factors are parsed, clamped or sent to the simulation.
- Any other HUD text or layout.
