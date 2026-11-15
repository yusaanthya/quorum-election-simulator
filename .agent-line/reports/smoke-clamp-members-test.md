---
item: smoke-clamp-members-test
result: done
---
## Summary

Added `TestClampMembers` to `internal/sim/session_test.go`: a table-driven test
that calls `clampMembers` directly with a value below `MinMembers`,
`MinMembers`, a value between the bounds (`(MinMembers + MaxMembers) / 2`),
`MaxMembers`, and a value above `MaxMembers`. Expected values use the
constants, not their current numbers. No other code or test changed.

## Tests run

- `go test ./internal/sim -run TestClampMembers -v`: all five subtests pass.
- The full check of `docs/night-runner.md` section 4.1 runs on the tip after
  this report is committed; its results are in the pull request body.

## Questions
