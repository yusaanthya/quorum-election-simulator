---
item: core-test-mocks
result: done
---
## Summary

Renamed `internal/core/test_util.go` to `internal/core/test_util_test.go`
with `git mv`. The content is unchanged (git reports a 100% similarity
rename). `MockTimer`, `MockNotifier`, their wrappers and the channel helpers
`waitForChannelReceive` and `assertChannelEmpty` are now compiled only into
the test build of package `core`, so the `testing` import no longer reaches
the production `core` package, the CLI binary or the WebAssembly build. All
users of these helpers are tests in package `core` (`core_test.go`,
`load_test.go`, `observer_test.go`), so no other file needed a change.

## Tests run

- `git diff -M --stat <base>..HEAD`: one rename,
  `internal/core/{test_util.go => test_util_test.go}`, 0 insertions and
  0 deletions.
- `grep -rn "MockTimer\|MockNotifier" --include=*.go .`: every match is in
  `internal/core/test_util_test.go`; no non-`_test.go` file is listed.
- `go build ./...`: passes.
- `GOOS=js GOARCH=wasm go build -o /dev/null ./cmd/wasm`: passes.
- `go test -race -count=1 ./...`: passes; no existing test file is changed.
- The full check of `docs/night-runner.md` section 4.1 runs on the tip after
  this report is committed; its results are in the pull request body.

## Questions
