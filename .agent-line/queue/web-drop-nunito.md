---
id: web-drop-nunito
status: ready
created: 2026-11-25T00:10:00+08:00
dependsOn: []
merge: runner
---
## Goal

`web/src/main.ts` imports `@fontsource/nunito/latin-600.css` and
`@fontsource/nunito/latin-800.css` on lines 1 and 2, but nothing renders in
Nunito: `web/src/style.css` sets `--sans` to Noto Sans TC and `--serif` to
Noto Serif TC (loaded from Google Fonts by `web/index.html`), and no other
`.css` or `.ts` file under `web/src/` names Nunito. The two imports make every
visitor download and parse two unused `@font-face` blocks. Remove them.

## Acceptance criteria

- The two `@fontsource/nunito/...` imports are gone from `web/src/main.ts`,
  and `grep -ri nunito web/src` finds nothing.
- After `npm run build:pages` and `npm run build` in `web/`, no CSS file under
  `web/dist-pages/` or `internal/web/dist/` (the two `outDir`s of
  `web/vite.config.ts`) contains `Nunito` or `nunito`, and neither directory
  holds a `nunito-*.woff2` or `.woff` file.
- Page text and fonts are unchanged: `--sans` and `--serif` in
  `web/src/style.css` are untouched.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Removing the `@fontsource/nunito` dependency from `web/package.json` and
  `web/package-lock.json`. Both are owner-level paths
  (`docs/night-runner.md` section 4.2); the owner removes the dependency
  separately. Do not touch either file.
- The `"Nunito"` name in the `font` stack of `web/concepts.html`: it is a
  fallback name, not an import.
- Any other font or CSS change.
