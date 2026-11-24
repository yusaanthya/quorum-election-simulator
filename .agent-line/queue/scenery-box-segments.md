---
id: scenery-box-segments
status: ready
created: 2026-11-25T00:11:00+08:00
dependsOn: []
merge: owner
---
## Goal

`roundedBox` in `web/src/scenery/kit.ts` builds every `RoundedBoxGeometry` with
3 corner segments. The academy bookshelf in `web/src/scenery/academy.ts`
(the parts of all seven shelves are merged by `mergeGeometries(parts)` into one mesh)
builds its frame, recess, three boards and every book through it, with a radius
of 0.02 for all but the frame. At a 0.02 radius a single segment looks the
same on screen, and the extra segments cost about 96k triangles across the
merged shelves. Use fewer segments for small radii.

## Acceptance criteria

- `roundedBox` in `web/src/scenery/kit.ts` passes 1 segment when the
  requested radius `r` is at most 0.03, and 3 segments otherwise. Decide on
  `r`, not on the clamped radius `Math.min(r, w / 2, h / 2, d / 2)`: the sky
  banner asks for 0.04 but is clamped to 0.025 by its 0.05 depth, and it must
  keep 3 segments. The signature and the clamped radius do not change.
- Callers with a larger radius keep their geometry exactly: the shelf frame
  (0.08) in `academy.ts`, the banner (0.04), stone base and cap (0.07) in
  `web/src/scenery/sky.ts`, and the door (0.1) in `web/src/scenery/forest.ts`.
  Only the 0.02 parts (recess, boards, books) change.
- The pull request body states the triangle count of the merged shelves geometry
  before and after. Measure it as `index.count / 3` of the merged shelves geometry (or
  `position.count / 3` if it is not indexed) with a throwaway script or
  temporary log that is not committed, or read
  `renderer.info.render.triangles` before and after.
- The triangle count of the merged shelf geometry drops, by roughly the
  96k estimated above across the shelves.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Changing which parts a bookshelf has, their sizes, radii or colors.
- Any other scenery, theme or lighting change.
- Judging how the shelves look. A run cannot do that: list under
  `## Unresolved` in the pull request body that the owner should compare a
  before and after screenshot of the academy shelves at 1280x800 and confirm
  the book and board edges still look rounded.
