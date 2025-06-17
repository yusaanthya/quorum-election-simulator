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
		logrus.Fatalf("Error initializing Logger : %v", err)
	}

	if err := cobra.ExecuteCmd(); err != nil {
		logrus.Fatalf("Error executing command: %v", err)
		os.Exit(1)
	}

	reader := bufio.NewReader(os.Stdin)

	var quorum *core.Quorum
	var members = cobra.GetMembers()

restartLoop:
	for {
		quorum = core.NewQuorum(members)
		quorum.Start()

	mainLoop:
		for {
			select {
			case <-quorum.Done():
				logrus.Info("Quorum ended. Returning to main loop.")
				break mainLoop
			default:
				input, _ := reader.ReadString('\n')
				input = strings.TrimSpace(input)

				switch {
				case input == "exit":
					logrus.Info("Exiting CLI...")
					quorum.Stop()
					return
				case input == "restart":
					logrus.Info("Restarting quorum...")
					quorum.Stop()
					continue restartLoop
				case strings.HasPrefix(input, "kill "):
					parts := strings.Split(input, " ")
					if len(parts) == 2 {
						id, err := strconv.Atoi(parts[1])
						if err == nil {
							quorum.KillMember(id)
						}
					}
				default:
					logrus.Error("Unknown command")
				}
			}
		}
	}
}
