package main

import (
	"os"

	"github.com/Anthya1104/quorum-election-cli/internal/cobra"
	"github.com/Anthya1104/quorum-election-cli/internal/config"
	"github.com/Anthya1104/quorum-election-cli/internal/logger"
	"github.com/Anthya1104/quorum-election-cli/internal/service"
	"github.com/sirupsen/logrus"
)

func main() {

	if err := logger.InitLogger(config.LogLevelInfo); err != nil {
		logrus.Fatalf("Error initializing Logger : %v", err)
	}

	if err := cobra.ExecuteCmd(); err != nil {
		logrus.Fatalf("Error executing command: %v", err)
		os.Exit(1)
	}

	service.RunQuorumSetup()
}
