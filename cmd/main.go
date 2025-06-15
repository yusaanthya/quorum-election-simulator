package main

import (
	"bufio"
	"os"
	"strconv"
	"strings"

	"github.com/Anthya1104/quorum-election-cli/internal/cobra"
	"github.com/Anthya1104/quorum-election-cli/internal/config"
	"github.com/Anthya1104/quorum-election-cli/internal/core"
	"github.com/Anthya1104/quorum-election-cli/internal/logger"
	"github.com/sirupsen/logrus"
)

func main() {

	if err := logger.InitLogger(config.LogLevelInfo); err != nil {
		logrus.Fatalf(("Error initializing Logger : %v"), err)
	}

	if err := cobra.ExecuteCmd(); err != nil {
		logrus.Fatalf("Error executing command: %v", err)
		os.Exit(1)
	}

	// main mechanism
	members := 3 // TODO: make this default var as input
	quorum := core.NewQuorum(members)
	quorum.Start()

	reader := bufio.NewReader(os.Stdin)
	for {
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)
		if input == "exit" {
			break
		} else if strings.HasPrefix(input, "kill ") {
			parts := strings.Split(input, " ")
			if len(parts) == 2 {
				id, err := strconv.Atoi(parts[1])
				if err == nil {
					quorum.KillMember(id)
				}
			}
		} else {
			logrus.Error("Unknown command")
		}
	}

}
