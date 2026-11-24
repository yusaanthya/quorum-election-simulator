# Design: furry mochi cats

Status: draft for owner review, 2026-11-20.

## 1. Intent

The visualizer's members are cats ("mochi"). Today each one is procedural
three.js geometry in `web/src/scene/mochi.ts`: a lathe body, ears raised out
of the dome, and one canvas-painted coat per member. The owner wants a
character with more design to it. They drew a concept: a round, dark
"coal-ball" cat with big ring eyes, whiskers, pointed ears and a thin tail,
and no mouth.

The goals for the new cat:

- **Soft like a rice cake when still.** The shape is a mochi blob that
  settles under its own weight and is covered in fur.
- **Springy when it moves.** It bounces like mochi, not like a rigid object
  being scaled.

A sequence of throwaway spikes settled the look with the owner. This document
records what they approved, so the real implementation can be planned without
asking them again.

## 2. Goals

1. Replace each member's body, coat, eyes and whiskers with one shared cat
   model. The model is authored in Blender and loaded as a GLB.
2. Cover the body and tail with shell fur that reads at the app's camera
   distance.
3. Give the five-member cast five distinct coats: pattern, colours, eye
   colours and fur length. Every coat uses the same model.
4. Replace the uniform-scale hop and squash with a base-anchored mochi
   bounce. The top lags behind the base, and the tail swings on its own
   spring.
5. Add a warm rim light to the cats' own materials, so dark coats read in the
   dim scenery.
6. Keep every existing member behaviour and indicator working (section 5.6).

## 3. Non-goals

- **Fur that reacts to motion.** The spike had fur tips with inertia. The
  owner saw no real visual gain and chose static fur for performance. Do not
  ship that code.
- **Shadows and ambient occlusion that follow the bounce.** They keep the
  undeformed shape, as they did in the spike.
- **Changes to scenery, lighting, the HUD or the simulation.** The rim light
  lives in the cat materials only.
- **Per-member customisation by the viewer, more than five base coats, or
  new member states.**
- **Rewriting the README or `docs/architecture.md`.** Updating the README
  screenshot after release is a follow-up (section 9).

## 4. Anti-goals

The work counts as a failure, even if it technically works, if any of these
happen:

- The cats get a mouth or a nose.
- The black cat stops reading as a black coal ball, or turns into a dark blob
  that disappears into the room.
- White fur looks grey or dirty. The owner rejected an orange tabby for
  looking "not clean".
- An indicator the viewer relies on stops reading: the leader's crown and
  lamp, the candidate sigil, the election timer ring, or a stopped member's
  closed eyes.
- Fur grows over the eyes or whiskers, so the face is unreadable.
- The public site becomes noticeably sluggish where the current site is
  smooth. That includes phones, with up to 9 members (sections 6 and 7).

## 5. What was decided

### 5.1 The model

The approved shape is spike model `cat_v2`. Measurements use Blender units of
1 m:

| Property | Value |
| --- | --- |
| Body width | 1.196 |
| Body depth (front to back) | 1.273 |
| Dome top | 1.07 |
| Ear tips | about 1.165 |
| Origin | bottom centre |
| Front | -Y in Blender, which is +Z in three.js |

The body is widest at about 0.36 and sits on a flat patch about 0.31 in
radius. The bottom spreads like a resting mochi.

Objects in the model:

- **`Body`:** includes the ears. About 6.8k triangles, smooth quads before
  export, no n-gons.
- **`Tail`:** a separate object with its origin where it leaves the body, so
  it can swing.
- **`Eye_L`, `Eye_R`:** yellow ring, dark centre, small white highlight.
- **`Whiskers_L`, `Whiskers_R`:** three strips per side.

The eyes and whiskers are separate objects because coats recolour them and
sleep hides the eyes.

Shape details the owner asked for:

- **Ears:** softly pointed tips, not flat, not needle-sharp, not bear-round.
- **Face:** no mouth and no nose.
- **Tail:** rises from the back and curls up. From the front it shows past
  the right edge, as in the owner's drawing.

Source rules:

- The GLB is exported with the blender-agent-skills `web` preset: meshopt
  compression, plus the sheen and specular extensions. three.js needs
  `MeshoptDecoder`.
- **The shipped GLB is the approved spike file, committed byte for byte.**
  It is `web/src/assets/cat_v2.glb` on `spike/fur-cats`, 167,652 bytes. The
  owner approved this exact mesh, and the Quadriflow remesh may not
  reproduce it exactly. (My call.)
- **The Blender 5.3 script that made it is committed next to it as its
  source.** Repo-relative paths only, no absolute local paths. The command
  to rebuild it is documented next to the script.
  - The preserved spike scripts stop at the `.blend` file. Add the GLB
    export step with the `web` settings above, so the script produces the
    GLB.
  - The spike scripts are on the local, unpushed branch `spike/fur-cats`,
    under `spike-artifacts/blender/`. They still write to a temporary
    directory.
- **A regenerated GLB counts as the same cat** when it keeps the contract
  the code relies on, and the owner agrees it looks the same. Document the
  contract next to the script:
  - objects `Body` and `Tail`
  - `Eye_L`, `Eye_R`, `Whiskers_L` and `Whiskers_R` as children of `Body`
  - the eye-ring material named `M_EyeRing`
  - the fur material `M_Fur`
  - the origins described above

  The GLB also carries a vertex colour: Blender's `Col`, exported as glTF
  `COLOR_0` on `Body` and `Tail`, holding lighter ears and tail. The
  approved look does not use it. The spike's materials turn vertex colours
  off, and the coat colour comes only from the shader (section 5.3). It is
  not part of the contract.

  Any later change to the shape goes back to the owner for a look.
- The spike that ships the GLB to the app imports it as a Vite asset URL,
  `web/src/assets/cat_v2.glb?url`. The default-mode Vite config has
  `publicDir: false`, so a public folder does not work in both build modes.
- The model is the repository's own work. It was modelled from the owner's
  drawing. The Tripo AI three-view was only a proportion reference. Do not
  commit the Tripo images, since their licence is unclear.

### 5.2 Fur

The fur is shell fur. Each shell is pushed out along the normal in the vertex
shader. A strand-noise threshold discards fragments, rising per layer so
strands taper. Roots are darker, tips carry a rim, and gravity droop and
light wind sway are applied.

A procedural fur normal map covers the base layer. It is sampled triplanar in
object space, because the model's UVs are an untuned automatic unwrap. Body
and tail both get fur.

**Shared settings the owner approved:**

| Setting | Value |
| --- | --- |
| shells | 22 |
| strand thickness | 0.46 |
| gravity | 0.43 |
| wind | 0.19 |
| normal strength | 0.94 |
| normal tiles per metre | 9 |

**Face mask.** Fur length tapers gradually to zero around the eyes and
whiskers, over roughly 13 cm. It must not cut off abruptly: the owner saw a
dark "bald ring" when it did. The bare skin there gets a per-coat tint, so it
does not read as a hole. Fur also fades at the flat base, so it does not pass
through the floor.

### 5.3 Coats

Members 0 to 4 get these coats in order. Colours are sRGB.

| # | Name | Pattern | Colours (base, 2nd, 3rd) | Eyes (L, R) | Whiskers | Fur length (m) | Density (/m) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Bombay coal ball | solid | #3f3d5c, #4c4b6d (ears, tail), #3f3d5c | #f3b831, #f3b831 | #ebebef | 0.071 | 135 |
| 1 | Odd-eyed white (Turkish Angora) | solid | #f7f5f2, #f6e9e9 (inner ear), #f7f5f2 | #f0a42c, #5fb6f0 | #aaa6ae | 0.082 | 140 |
| 2 | Calico | patches | #f4efe8, #e0873a, #2e2a30 | #6fbf5a, #6fbf5a | #7d7880 | 0.065 | 140 |
| 3 | Ragdoll colour-point | points | #f1e6d2, #5a4036 (points), #f1e6d2 | #4d9be3, #4d9be3 | #ffffff | 0.095 | 120 |
| 4 | British Shorthair blue bicolour | bicolour | #7d8696, #f2efea (white areas), #7d8696 | #e58a24, #e58a24 | #86828c | 0.04 | 200 |

**Shading settings for each coat:**

| # | Root darkness (1 = none) | Bald tint | Tip rim | Scatter | Room rim |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.42 | 0.8 | 0.8 | 0 | 1.4 |
| 1 | 0.9 | 0.97 | 0.25 | 0.3 | 0.3 |
| 2 | 0.75 | 0.95 | 0.4 | 0.12 | 0.55 |
| 3 | 0.65 | 0.9 | 0.5 | 0.08 | 0.5 |
| 4 | 0.7 | 0.95 | 0.5 | 0.1 | 0.8 |

Each coat also has a pattern seed: 1 to 5 in table order.

**Pattern rules.** Patterns are procedural noise in object space. The base
layer and every shell evaluate the same colour, so the fur carries the
pattern.

- **solid:** one colour, with the second colour tinting the ears only, by
  distance to the ear tips. The tail stays the base colour. This is what the
  owner approved in the spike. The concept drawing's lighter tail was not
  carried over.
- **patches:** two thresholded low-frequency noise fields over a white base,
  with a white chest. Dark patches stay back from the eyes.
- **points:** darkening near the ear tips, a face mask and the tail.
- **bicolour:** a white chest and muzzle with a noisy edge, and a white tail
  tip.

**Members 5 to 8.** The app allows up to 9 members. Member `id` uses coat
`id % 5`, with its pattern seed raised by 100 × `floor(id / 5)`.

Only seed-dependent patterns change on a repeat: the calico patches and the
British bicolour's white edge. The solid and colour-point branches ignore
the seed, and so does the strand placement. A repeated Bombay, white or
Ragdoll therefore looks the same as the original, and the name label tells
them apart. I accept that, because the owner only defined five coats; it is
listed in section 9. (My call.)

The "stripes" pattern from the spike is not used by any coat. Do not ship it.

Owner-approved readability requirements:

- Each coat is identifiable at the app's default camera distance.
- The white cat reads clean white.
- Light whiskers are never placed on white fur.

### 5.4 Rim light

A fresnel rim is added in the cat shaders only: the base fur layer, every
shell, and the tail. It is weighted towards the fur tips, and there is none
on the bare skin around the eyes. Scene lights are unchanged.

- **Colour:** warm `#ffe0c0`. The owner compared it with lavender `#c9c4e8`
  in the real scene and chose the warm one.
- **Strength:** per coat, the "room rim" column in section 5.3.

### 5.5 Motion

The bounce is a vertex deformation applied identically to the body, the fur
shells, the eyes and the whiskers. The shells are offset after the
deformation, so the fur stays on the body.

- **Squash and stretch** is anchored at the base and roughly preserves
  volume. On landing the base spreads widest and the top flattens. Before
  take-off the body stretches up while the base is still on the ground.
- **The top lags the base.** A height weight runs from 0 at the base to 1 at
  the top. A damped spring per cat makes the top wobble back after landing.
  The ears follow the top. The crown and the lamp ride the deformed head.
- **The tail** swings on its own spring around its origin and follows the
  deformed surface.

Spike defaults to start from:

| Setting | Value |
| --- | --- |
| hop height | 0.3 m |
| squash amount | 1 |
| wobble stiffness | 120 |
| wobble damping | 6 |

Triggers are the existing ones in `Mochi.update`:

- candidates hop
- a received message bumps
- a role change pops
- a stopped member slumps
- everyone breathes

Each cat has its own phase, so they do not move in lockstep.

### 5.6 Behaviour that must be kept

- **Leader:** the crown and the leader's lamp and light. They follow the
  deformed head.
- **Timer and sigils:** the election timer ring, and the campaign and leader
  sigils.
- **Label:** the CSS2D name label sits above the new head, ears and fur
  included. Keep the spike's offsets, which the owner saw and accepted:
  0.42 above the ear tips plus the coat's fur length, and 0.72 for the
  leader. The crown and lamp positions from the spike were also seen and
  accepted.
- **Timer ring and sigils:** they must stay readable around the new, wider
  body. The body radius is about 0.6, and up to about 0.69 with fur. Today's
  timer ring is `RingGeometry(0.62, 0.72)`, so fur may cover its inner edge.
  The builder may resize the ring, the sigils or the stand radius to keep
  them readable, as long as they keep their look.
- **Picking:** hover and click hit the new body. Click stops a member, as
  today.
- **Facing:** facing and turning work as now.
- **Stopped state:** the sleep tilt and the grey tint for a stopped member.
- **Sleep eyes:** the GLB open eyes are hidden, and a downward closed-lid arc
  is drawn at each ring centre. Each arc takes that eye's colour, so odd eyes
  stay odd while asleep. The lids deform with the body.
- **Theme hooks:** the `MemberLook` theme hooks (lamp height and intensity,
  sigil glow and ink).
- **Pages:** the dev-only `concepts.html` page and its `lineup` theme still
  work.

## 6. Constraints

- **Stack:** three.js r0.187, TypeScript and Vite. Both build modes must work:
  the default mode embedded in the Go binary, and the `wasm` mode for
  Cloudflare Pages. Every merge to `main` deploys the public site.
- **The model loads once and every member clones it.** Members are built from
  it, so it must finish loading before the first simulation event creates a
  member.
- **Performance is unmeasured on real hardware.** The spike only ran on a CPU
  renderer.
  - Measured on a 5-cat scene with shadows: today's `main` is about 585k
    triangles and 578 draw calls. The spike is about 1.33M triangles at 22
    shells and 773k at 8 shells, at 648 draw calls.
  - Fur cost is mostly overdraw from the shells.
  - The site already skips ambient occlusion on screens under 640 px wide,
    and `?ao=0` turns it off.
    (Since pull request #62 it also needs a fine pointer, so phones and
    tablets skip it at any width.)
- **No new runtime dependencies.** `MeshoptDecoder` ships with three.
- **Public repository.** No absolute local paths in committed files.
- **Delivery.** Work lands through pull requests, as for every change. Merge
  rules are in `docs/decisions.md` and the owner's conventions.
  - The owner's phone and desktop check (section 7) must happen before any
    merge that changes the cats.
  - If any of this is queued for the night runner, the queue item must set
    `merge: owner`, so the runner cannot merge before that check.
  - The approved GLB and the spike scripts exist only on the local branch
    `spike/fur-cats`. The first implementation branch must bring them into
    the repository.

## 7. My calls (builder's defaults; the owner can override)

- **Performance safeguard.** Set by the owner on 2026-11-20: the public site
  must run smoothly on phones too, so the shell count drops automatically
  with member count and screen size. (Owner's decision.)
  - The count is chosen on every cast rebuild, before that rebuild builds
    its first member. The inputs are the member count of that game and the
    viewport.
    - The HUD can restart a game with 3, 5 or 7 members on the same page.
      `main.ts` calls `rebuild(state.size)` on every `quorum_started`, so a
      count chosen once at load would be wrong after a restart.
    - The GLB stays loaded and cached. The shell geometry's instance count
      and the shader's shell uniform are both set from the chosen count.
    - Members can be up to 9.
    - Small screens are under 640 px wide, the same breakpoint as ambient
      occlusion.
  - The owner approved the look at 22 shells for 5 members on a desktop.
    That is the upper bound, and it is what a desktop with 5 members gets.
  - My suggested rule:
    - Hold total fur triangles to a budget: on a desktop, what 5 members
      cost at 22 shells; on a small screen, what 5 members cost at 10.
    - Shells = budget / (members × fur triangles per cat), clamped to 6–22.
    - The builder may refine the numbers after measuring, as long as the
      look at 5 members on a desktop is unchanged.
  - Keep the spike's `?shells=N` URL parameter, like `?ao=0`, as an
    explicit override.
  - Before merge, the owner checks the frame rate with 5 and 9 members on a
    desktop and on a phone.
    - Phones cannot reach a server inside WSL bound to localhost. The plan
      must give the owner a phone-reachable preview, for example a
      LAN-bound preview with Windows port forwarding, or a Cloudflare Pages
      preview deploy.
    - A deploy needs the owner's OK.
- **Remove spike tuning parameters.** `?rim` and `?rimColor` were for
  choosing the look. The chosen values become constants.
- **Shared GLB.** One GLB serves every coat. Coat colours, eye colours and
  whisker colours are shader or material parameters, not baked textures.

## 8. Left to the builder

- **File layout:**
  - which modules the cat, fur and coat code live in
  - whether `Mochi` keeps its name
  - where the Blender script lives
- **Shader structure:**
  - how the shells are drawn (instancing or one draw per shell)
  - how the deformation is shared between materials
- **Pull requests.** Whether to split the work, for example the model and its
  script first, then the integration.
- **Graininess.** How to keep the fur from shimmering at distance, if it
  turns out to need work. The spike's fur read slightly grainy at the default
  camera distance; the owner did not ask for a fix.
- **Tests.** Which unit tests fit. Pure helpers such as coat selection for a
  member id, and the spring maths, are candidates. Visual checks are done by
  the owner on a preview.

## 9. Known gaps and follow-ups

These are recorded here and are not in scope:

- **Whisker colour.** Whiskers turn brownish under the room's warm light.
- **Shadows.** Shadows and ambient occlusion do not follow the bounce.
- **README screenshot.** Refresh `docs/visualizer-preview.png` after
  release.
- **Wasm build cache.** In a sandboxed agent session, `npm run build:pages`
  needed `GOCACHE` pointed at a writable directory.
- **Repeated coats.** With 6 to 9 members, a repeated Bombay, white or
  Ragdoll looks the same as the original (section 5.3).
- **Picking.** Picking raycasts the resting `Body` triangles. The shader
  moves the visible silhouette during a stretch, so a click on the very
  edge at full stretch may miss. The builder should check this does not
  feel broken.

## 10. References

- The owner's concept drawing and the Tripo three-view are kept outside the
  repository.
- Spike branch `spike/fur-cats` is local and unpushed. It is a throwaway
  preview of this design in the real scene. Do not merge the branch.
  - Its code is the repository's own work and may be copied into the real
    implementation, then cleaned up to match this document. (My call.)
  - When copying, drop `?rim` and `?rimColor`, the unused stripes pattern
    and the fur-reacts code.
  - Its commits:
    - `8531a6f` integration
    - `fc45d89` rim light
    - `238e46e` warm rim default
    - `128b5ea` preserved Blender scripts, the fur comparison page, the
      chosen parameters and renders under `spike-artifacts/`
