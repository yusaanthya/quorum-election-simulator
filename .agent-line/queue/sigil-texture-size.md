---
id: sigil-texture-size
status: ready
created: 2026-11-25T00:12:00+08:00
dependsOn: []
merge: owner
---
## Goal

`web/src/scene/magic.ts` draws each magic circle into two canvases (`rings`
and `stars`, made by `texture()` and cached by `sigilTextures()`):
`BIG = 2048` pixels for the large circles in the academy, sky and forest
scenery, `SMALL = 1024` for the `simple` circles in `web/src/scene/mochi.ts`.
With mipmaps that is about 68 MB of GPU memory (2 x 2048^2 + 4 x 1024^2
texels), and each canvas also stays in RAM. Halve the large size to 1024
pixels.

`BIG` currently does two jobs: it is the canvas size of a large circle and it
is the unit of the drawing space ("Drawing code works in a 2048-unit space
centered on the origin" in `texture()`, which scales by `size / BIG`;
`const R = (BIG / 2) * 0.95` and the radii in the drawing functions are in
those units). Changing it as is would shrink or crop the drawing. Keep a
2048-unit drawing space and make the pixel size a separate, smaller number.

## Acceptance criteria

- The drawing space stays 2048 units: a constant (for example `SPACE = 2048`)
  is used for `R`, for `lctx.scale(size / SPACE, size / SPACE)` and for `px`
  in `texture()`, and every drawing function still receives the same
  coordinates. The large circle's canvas size becomes 1024. `SMALL` stays
  1024, so `simple` still changes what is drawn, not the resolution.
- The blur radii in `texture()` still scale with the canvas size, so the glow
  looks the same relative to the circle.
- The circle is drawn whole, not cropped or shifted: a throwaway screenshot or
  `getImageData` check (not committed) shows the outer ring reaching about 95%
  of the half width at both sizes.
- Releasing the source canvases after upload is allowed only if the run can
  confirm it from the three.js source in `web/node_modules/three`: that a
  `CanvasTexture` does not need its canvas again for re-upload after a WebGL
  context restore or `needsUpdate`, and that nothing in `web/src/` sets
  `needsUpdate` on these textures or recreates the renderer. If that is not
  clear, leave the canvases alone and say so in the pull request body. Do not
  trade correctness for memory here.
- The pull request body states the texture sizes before and after and the
  memory estimate.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Changing what is drawn, the colors, opacity, glow, `anisotropy`, or the
  cache key in `sigilTextures`.
- Sigil sizes, positions or the shared lamp light in `mochi.ts`.
- Judging sharpness. A run cannot do that: list under `## Unresolved` that the
  owner should look at the central magic circle on desktop (1280x800, and
  1920x1080 if available) and confirm the linework is still crisp.
