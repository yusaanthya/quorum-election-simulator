# binary file path (command line only; not read from the environment, since clean removes it)
BIN_DIR := bin

# build version var; empty keeps the Version in internal/config/config.go
VERSION ?=

MODULE      := github.com/Anthya1104/quorum-election-cli
OUT_DIR     := $(BIN_DIR)/quorum-election
VERSION_VAR := $(MODULE)/internal/config.Version
LDFLAGS     := $(if $(VERSION),-ldflags "-X '$(VERSION_VAR)=$(VERSION)'")

# supported platforms
OS_LIST := windows darwin linux
ARCH_LIST := amd64 arm64
PLATFORM_TARGETS := $(foreach OS,$(OS_LIST),$(foreach ARCH,$(ARCH_LIST),build-quorum-election-$(OS)-$(ARCH)))

# # init directories
.PHONY: init
init:
	@mkdir -p $(BIN_DIR)


# quorum-election builds; the old binary is removed first so a failed build leaves none behind
define build_quorum_election
.PHONY: build-quorum-election-$(1)-$(2)
build-quorum-election-$(1)-$(2): init
	@echo "Building quorum-election for $(1)/$(2)..."
	@mkdir -p $(OUT_DIR)/log
	rm -f $(OUT_DIR)/quorum_election_app_$(1)_$(2)$(if $(filter windows,$(1)),.exe,)
	GOOS=$(1) GOARCH=$(2) go build $(LDFLAGS) -o $(OUT_DIR)/quorum_election_app_$(1)_$(2)$(if $(filter windows,$(1)),.exe,) ./cmd/main.go
endef
$(foreach OS,$(OS_LIST),$(foreach ARCH,$(ARCH_LIST),$(eval $(call build_quorum_election,$(OS),$(ARCH)))))

# build all platforms; any failing platform fails the whole run
.PHONY: all build-quorum-election-all
all: $(PLATFORM_TARGETS)
build-quorum-election-all: all

# clean bin dir
.PHONY: clean
clean:
	rm -rf $(BIN_DIR)
