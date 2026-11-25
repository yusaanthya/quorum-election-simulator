---
item: fps-meter-decimals
result: done
---
## Summary

`web/src/ui/fps.ts` now exports a pure `formatFps(fps: number): string`.
It returns the one-decimal form when that form is below 10 (`4.6` gives
`"4.6"`, `9.94` gives `"9.9"`, `0` gives `"0.0"`). Otherwise it returns a
whole number (`10` gives `"10"`, `59.7` gives `"60"`, `9.96` gives `"10"`).
`createFpsMeter` uses it for the fps part of its text. The ms part, the
` fps · ` separators, the update interval and the one second window are
unchanged. `fps.ts` still has no imports and touches `document` only inside
`createFpsMeter`.

A new `scripts/fps-meter.test.mjs` imports `web/src/ui/fps.ts` directly
through Node's type stripping and covers `4.6`, `0.2`, `9.94`, `0`, `10`,
`59.7` and `9.96`. `0` prints `"0.0"` because it is below 10, which is what
the item's rule says.

## Tests run

- `node --test scripts/*.test.mjs`: 56 tests pass, 3 of them new.
- The full check of `docs/night-runner.md` section 4.1 runs on the tip
  before the pull request opens. Its results are in the pull request body.

## Questions
