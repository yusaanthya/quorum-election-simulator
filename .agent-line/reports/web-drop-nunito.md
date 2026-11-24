---
item: web-drop-nunito
result: done
---
## Summary

Removed the two unused `@fontsource/nunito` imports (`latin-600.css` and
`latin-800.css`) from lines 1 and 2 of `web/src/main.ts`. Nothing in the page
used Nunito, because `--sans` and `--serif` in `web/src/style.css` name the
Noto TC fonts and were not changed. The builds no longer emit the two Nunito
`@font-face` blocks or the Nunito font files. `web/package.json`,
`web/package-lock.json` and `web/concepts.html` are untouched, as the item
requires.

## Tests run

- `grep -ri nunito web/src`: no matches.
- After `npm run build:pages` and `npm run build`, no CSS file under
  `web/dist-pages/` or `internal/web/dist/` contains `nunito` (case
  insensitive), and neither directory holds a file whose name contains
  `nunito`.
- Full check of `docs/night-runner.md` section 4.1 (`gofmt -l .`,
  `node --test scripts/*.test.mjs`, `go vet ./...`,
  `GOOS=js GOARCH=wasm go vet ./cmd/wasm`, `go test -race ./...`, `npm ci`,
  `npm run build:pages`, `npm run build`): all pass.

## Questions
