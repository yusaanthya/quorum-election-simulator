package main

import (
	"bufio"
	"context"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"

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

	// goroutine for main function flow controlling
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// graceful shutdown
	wg.Add(1)
	go func() {
		defer wg.Done()
		select {
		case sig := <-sigChan:
			logrus.Infof("Received signal %v. Initiating graceful shutdown...", sig)
			cancel()
		case <-ctx.Done():
			logrus.Debug("Signal listener goroutine received context done.")
			return
		}
	}()

	// tracking runQuorumCLI (in main.go layer)
	wg.Add(1)
	go func() {
		defer wg.Done()
		runQuorumCLI(ctx, cancel)
	}()

	logrus.Info("Main function waiting for all top-level goroutines to finish...")
	wg.Wait()
	logrus.Info("All top-level goroutines finished. Exiting application.")
	os.Exit(0)
}

func readInputLoop(ctx context.Context, inputChan chan<- string) {
	reader := bufio.NewReader(os.Stdin)
	for {
		select {
		case <-ctx.Done():
			logrus.Debug("Input reader goroutine received context done, stopping.")
			return
		default:
			input, err := reader.ReadString('\n')
			if err != nil { // ctrl+C or other error
				logrus.Debugf("Error reading input or EOF: %v. Stopping input reader.", err)
				return
			}
			select {
			case inputChan <- strings.TrimSpace(input):
			case <-ctx.Done():
				logrus.Debug("Input reader goroutine context done while sending input.")
				return
			}
		}
	}
}

// manage the CLI tool by context created in main.go
func runQuorumCLI(ctx context.Context, cancel context.CancelFunc) {
	// channel to read input
	inputChan := make(chan string)
	go readInputLoop(ctx, inputChan)

	var quorum *core.Quorum
	var members = cobra.GetMembers()

	realTimer := core.NewRealTimer()

restartLoop:
	for {
		select {
		case <-ctx.Done():
			logrus.Info("Graceful shutdown initiated. Exiting restart loop.")
			if quorum != nil {
				quorum.Stop()
			}
			return
		default:
			// continue the game
		}

		// quorum instance managed by internal context -> only notify the main layer when all goroutines done
		quorum = core.NewQuorum(members, realTimer, core.NewNoOpNotifier())
		quorum.Start()

	mainLoop:
		for {
			select {
			case <-quorum.Done():
				logrus.Info("Quorum ended. Returning to main loop.")
				break mainLoop

			case <-ctx.Done():
				logrus.Info("Graceful shutdown initiated. Stopping quorum and exiting CLI.")
				if quorum != nil {
					quorum.Stop()
				}
				return

			case input := <-inputChan:
				switch {
				case input == "exit":
					logrus.Info("CLI Command: Exiting CLI...")
					cancel()

				case input == "restart":
					logrus.Info("CLI Command: Restarting quorum...")
					if quorum != nil {
						quorum.Stop() // waited until the quorum internal flow all done
					}
					continue restartLoop

				case strings.HasPrefix(input, "kill "):
					parts := strings.Split(input, " ")
					if len(parts) == 2 {
						id, err := strconv.Atoi(parts[1])
						if err == nil {
							if quorum != nil {
								quorum.KillMember(id)
							} else {
								logrus.Warn("Quorum not active to kill member.")
							}
						} else {
							logrus.Errorf("Invalid member ID: %s", parts[1])
						}
					} else {
						logrus.Error("Usage: kill <member_id>")
					}
				default:
					logrus.Error("Unknown command")
				}
			}
		}
		if quorum != nil {
			quorum.Stop()
		}
	}
}
