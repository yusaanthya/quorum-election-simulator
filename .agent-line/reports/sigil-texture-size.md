---
item: sigil-texture-size
result: done
---
## Summary

Large magic circles in `web/src/scene/magic.ts` are now drawn on 1024-pixel
canvases instead of 2048-pixel ones. A new constant `SPACE = 2048` holds the
drawing space. `R`, the `lctx.scale(size / SPACE, size / SPACE)` call and
`px` in `texture()` use it, so every drawing function still receives the same
coordinates. `BIG` is now 1024 and `SMALL` stays 1024, so `simple` changes
only what is drawn. The blur radii still scale with `px = size / SPACE`, which
keeps the glow the same size relative to the circle.

Texture sizes: large circles go from 2048x2048 to 1024x1024, and `simple`
circles stay 1024x1024. Estimated GPU memory, using the item's basis of two
large and four small RGBA textures with mipmaps, goes from about 67 MB
(64 MiB) to about 34 MB (32 MiB).

The source canvases are left alone. This run did not confirm from the
three.js source that they are safe to release, so the item's cautious default
applies.

## Tests run

- A throwaway `getImageData` check, not committed: a Vite bundle of `Sigil`
  ran in headless Chromium. Along the horizontal centre line, the last pixel
  of the rings layer with alpha above 200 sits at 95.4% of the half width on
  both sides. That holds for the new 1024-pixel large circle and for the old
  2048-pixel one, and the `simple` circle stays at 95.6%. The circle is drawn
  whole and centred.
- The full check of `docs/night-runner.md` section 4.1 ran on the tip. The
  pull request body has the results.

## Questions
