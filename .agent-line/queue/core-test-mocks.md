---
id: core-test-mocks
status: ready
created: 2026-11-16T22:12:00+08:00
dependsOn: []
merge: runner
---
## Goal

`internal/core/test_util.go` is not a `_test.go` file. It imports `testing`,
so `MockTimer`, `MockNotifier` and the other test helpers are compiled into
the production `core` package, the CLI binary and the WebAssembly build. Only
tests of package `core` use them. Make them test-only.

## Acceptance criteria

- The file is renamed to `internal/core/test_util_test.go` with git's rename
  detection keeping it a rename (its content unchanged, or changed only where
  the move requires it).
- `grep -rn "MockTimer\|MockNotifier" --include=*.go .` lists only `_test.go`
  files.
- `go build ./...` and `GOOS=js GOARCH=wasm go build ./cmd/wasm` succeed, and
  every existing test passes unmodified.
- The full check of `docs/night-runner.md` section 4.1 passes.
- The diff is that rename plus this item's report.

## Out of scope

- Any change to the helpers' behaviour or to other files.
