# Reference: Makefiles of high-star Go repositories (fetched 2026-10-27 via GitHub API)

| Repo | Stars | Makefile lines | Cross-platform release builds done by |
|---|---|---|---|
| junegunn/fzf | 83.8k | 236 | goreleaser (`.goreleaser.yml`); Makefile keeps per-arch targets + `release` wrapper |
| jesseduffield/lazygit | 83.4k | 77 | goreleaser; Makefile has only dev tasks |
| etcd-io/etcd | 52.4k | 249 | scripts |
| hashicorp/terraform | 50.2k | 50 | separate release tooling; Makefile has only dev/check tasks |
| cli/cli | 46.7k | 129 | goreleaser + `script/build.go`; Makefile delegates |
| golangci/golangci-lint | 19.5k | 150 | goreleaser |
| prometheus/node_exporter | 13.9k | 149 | `promu` via shared `Makefile.common` |

Patterns observed (with sources):

1. `.PHONY` declared for every non-file target, usually right above it
   (cli/cli, lazygit, golangci-lint; terraform lists them at the bottom).
2. Overridable variables use `?=` (fzf: `GO ?= go`, `GOOS ?= $(shell $(GO) env GOOS)`;
   cli/cli: `prefix ?= /usr/local`); internal derived values use `:=`.
3. Version is injected with ldflags, often from git:
   fzf: `VERSION := $(shell git describe --abbrev=0 ...)`,
   `BUILD_FLAGS := -a -ldflags "-s -w -X main.version=$(VERSION) -X main.revision=$(REVISION)" -tags "$(TAGS)" -trimpath`.
4. Build output goes to a dedicated directory (`bin/`, `target/`, `dist/`) and `clean`
   removes exactly those (fzf: `$(RM) -r dist target`). fzf uses an order-only
   prerequisite for the output directory (`bin/fzf: target/$(BINARY) | bin`).
5. Small, conventional target names for dev tasks: `build`, `test`, `lint`, `clean`,
   `install` (lazygit, cli/cli, golangci-lint).
6. 4 of the 6 application repos above delegate multi-platform release packaging to
   goreleaser rather than hand-written Makefile loops. (Adopting goreleaser would be a
   new mechanism in this repo — it needs explicit owner authorization under R3.)
