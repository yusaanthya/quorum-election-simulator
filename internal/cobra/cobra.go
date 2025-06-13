package cobra

import (
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

func InitCmd() error {
	rootCmd := &cobra.Command{
		Use:   "app",
		Short: "A base CLI app with Cobra and logrus",
		Run: func(cmd *cobra.Command, args []string) {
			logrus.Info("Hello from the base CLI app!")
		},
	}

	err := rootCmd.Execute()
	if err != nil {
		logrus.Fatalf("Error executing command: %v", err)
	}

	return err
}
