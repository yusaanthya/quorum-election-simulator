---
id: narrow-hud-buttons
status: ready
created: 2026-11-25T00:14:00+08:00
dependsOn: []
merge: owner
---
## Goal

On a 320 px wide screen two control rows of the title card (`.title-card` in
`web/src/style.css`, `width: calc(100vw - 2 * var(--gap))` in the
`max-width: 640px` block; the rows are built in `web/src/ui/hud.ts`) are wider
than the card and clip. Measured with Playwright at 320x640 on the PR 62 code:

- The members row (`.controls` holding the 3/5/7 `.segmented` group, 重新開局
  and 讓隊長下線): `scrollWidth` 300 against `clientWidth` 270. The 讓隊長下線
  button (`.btn.btn-primary`, `data-action="kill-leader"`) ends at x = 325,
  15 px past the card's right edge (310) and 5 px past the viewport.
- The slow-motion row (`.controls` holding the 1x to 20x `.segmented` group and
  暫停): `scrollWidth` 305 against `clientWidth` 270. The 暫停 button
  (`data-action="pause"`) ends at x = 330, 20 px past the card edge and 10 px
  past the viewport.
- The third row (選舉時自動放慢 and 兩位同時參選) fits at 320.
- At 360 and 390 px nothing in the card overflows.

The cause is that `.controls` is a non-wrapping flex row of fixed-width
buttons, and `.ctl-label` is already hidden on phones. Make the rows fit at
320 px.

## Acceptance criteria

- At viewport widths 320, 360 and 390 (height 640), every `button` and
  `.segmented` inside `.title-card` has its bounding box inside the card's
  bounding box, `.title-card` has `scrollWidth <= clientWidth`, and
  `document.documentElement.scrollWidth <= innerWidth`. Verify with Playwright
  (`require('playwright')`, `chromium.launch()`; WebGL is software rendered and
  slow, so allow 90 s timeouts) against
  `cd web && npm ci && npm run wasm && npx vite --mode wasm --host 127.0.0.1 --port 18950`,
  and give the measured numbers before and after in the pull request body.
- The change lives inside the `max-width: 640px` blocks of `web/src/style.css`
  (for example letting `.controls` wrap, or tightening button padding), so the
  layout above 640 px is unchanged. Button labels and `data-action` hooks in
  `web/src/ui/hud.ts` do not change, and no control is hidden.
- At 1280x800 the bounding boxes of `.title-card` and its buttons are the same
  before and after.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- The dock, the feed, the legend and the member labels.
- The 9 px `scrollWidth` excess of the slow-motion row at 1280 px (355 against
  `clientWidth` 346): no button leaves the card there, so it is a follow-up.
- New breakpoints above 640 px, new controls, or changed button text.
- Judging how it looks. A run cannot do that: list under `## Unresolved` that
  the owner should compare before and after screenshots at 320x640, 360x640
  and 390x640 and confirm the card still reads well.
