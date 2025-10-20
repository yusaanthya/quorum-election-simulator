# project root path
QUORUM_ELECTION_DIR := quorum-election
PROJECT_ROOT_DIR := github.com/Anthya1104

# config path
CONFIG_PATH := internal/config

# binary file path
BIN_DIR := bin

# build version var
VERSION ?= dev

# supported platforms
OS_LIST := windows darwin linux
ARCH_LIST := amd64 arm64

# # init directories
init:
	@mkdir -p $(BIN_DIR)


# quorum-election builds
define build_quorum_election
build-quorum-election-$(1)-$(2): init
	@echo "Building quorum-election for $(1)/$(2) (version: $(VERSION))..."
	@mkdir -p $(BIN_DIR)/log
	GOOS=$(1) GOARCH=$(2) go build -ldflags="-X '${PROJECT_ROOT_DIR}/$(QUORUM_ELECTION_DIR)-cli/${CONFIG_PATH}.Version=$(VERSION)'" -o ./$(BIN_DIR)/$(QUORUM_ELECTION_DIR)/quorum_election_app_$(1)_$(2)$(if $(filter windows,$(1)),.exe,) ./cmd/main.go
endef
$(foreach OS,$(OS_LIST),$(foreach ARCH,$(ARCH_LIST),$(eval $(call build_quorum_election,$(OS),$(ARCH)))))


# build all platforms for all projects
all: init
	$(foreach OS,$(OS_LIST),$(foreach ARCH,$(ARCH_LIST),$(MAKE) build-quorum-election-$(OS)-$(ARCH) VERSION=$(VERSION);))

build-quorum-election-all:
	$(foreach OS,$(OS_LIST),$(foreach ARCH,$(ARCH_LIST),$(MAKE) build-quorum-election-$(OS)-$(ARCH) VERSION=$(VERSION);))


# clean bin dir
clean:
	rm -rf $(BIN_DIR)