---
item: narrow-hud-buttons
result: done
---
## Summary

`.controls` now has `flex-wrap: wrap` inside the first `max-width: 640px`
block of `web/src/style.css`. At 320 px the last button of an over-wide row
(讓隊長下線 in the members row, 暫停 in the slow-motion row) moves to its own
line instead of running past the card. At 360 and 390 px the rows already fit,
so nothing moves. Above 640 px the rule does not apply. `web/src/ui/hud.ts` is
unchanged.

Measured with Playwright against `npx vite --mode wasm` (before → after):

- 320x640: rows `scrollWidth/clientWidth` 300/270, 305/270, 270/270 → 270/270
  for all three. `.title-card` 319/298 → 298/298. Before, kill-leader ended at
  x 324.7 and pause at x 329.6 against a card edge of 310; after, no button or
  `.segmented` group is outside the card. Document 320/320 both times. The
  card bottom moves from y 304.5 to 388.5; the dock starts at y 582.
- 360x640 and 390x640: nothing outside the card before or after, and every
  bounding box is identical.
- 1280x800: the `.title-card` box and every button box are identical before
  and after.

## Tests run

- Playwright measurement at 320x640, 360x640, 390x640 and 1280x800, before
  and after.
- The full check of `docs/night-runner.md` section 4.1 (see the pull request
  body).

## Questions
