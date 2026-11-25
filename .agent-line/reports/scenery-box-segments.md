---
item: scenery-box-segments
result: done
---
## Summary

`roundedBox` in `web/src/scenery/kit.ts` now passes 1 corner segment to
`RoundedBoxGeometry` when the requested radius `r` is at most 0.03, and 3
otherwise. The choice uses `r` before clamping, so the sky banner (0.04,
clamped to 0.025) keeps 3 segments. The signature and the clamped radius
`Math.min(r, w / 2, h / 2, d / 2)` are unchanged. The shelf frame (0.08), the
banner (0.04), the stone base and cap (0.07) and the door (0.1) keep their
geometry. Only the 0.02 recess, boards and books of the bookshelves change.

The merged shelves geometry goes from 138180 to 28740 triangles (`index.count
/ 3`), a drop of 109440. The item estimated about 96k. The difference comes
from the number of small parts: about 228 at 108 triangles each, against 588
for three segments. These counts came from a throwaway script that built the
academy theme into a `THREE.Scene` through Vite's SSR module loader, with a
stub `document`, and read the vertex-colored mesh. The script was not
committed.

## Tests run

- Triangle count of the merged shelves geometry, before and after, as above.
- Full check of `docs/night-runner.md` section 4.1 on the tip: see the pull
  request body.

## Questions
