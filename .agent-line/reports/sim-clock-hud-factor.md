---
item: sim-clock-hud-factor
result: done
---
## Summary

`web/src/ui/hud.ts` exports `formatFactor(factor)`, which returns
`String(Math.round(factor * 100) / 100)`: at most two decimals, no trailing
zeros. `Hud.setClock` uses it for the chosen factor in `慢動作 …x` and the
effective factor in `（選舉中 …x）`. The comparison `factor !== timeScale`
that decides whether the election suffix appears, and the preset button
match on `timeScale`, still use the unrounded values. Nothing else in the HUD,
and nothing about how factors are parsed, clamped or sent, changed.

`scripts/web-hud.test.mjs` imports `formatFactor` from the TypeScript source
in Node without a DOM, as `scripts/web-state.test.mjs` does with `state.ts`.
It checks `3.3000000000000003` -> `3.3`, `1.25` -> `1.25`, `1.236` -> `1.24`,
`9` -> `9`, and that every preset (`1` to `20`) and its election factor
(3 times the preset) format to the same text as before.

## Tests run

- `node --test scripts/*.test.mjs`: 37 tests, all pass (including the two new
  tests in `scripts/web-hud.test.mjs`).
- The full check of `docs/night-runner.md` section 4.1 runs on the tip after
  this report is committed; its results are in the pull request body.

## Questions
