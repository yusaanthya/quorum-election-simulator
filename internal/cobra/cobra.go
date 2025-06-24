package cobra

import (
	"github.com/Anthya1104/quorum-election-cli/internal/config"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var (
	members int
	rootCmd = &cobra.Command{
		Use:   "app",
		Short: "A base CLI app with Cobra and logrus",
		Run: func(cmd *cobra.Command, args []string) {
			logrus.Debugf("Hello from the base CLI app!")
		},
	}

	versionCmd = &cobra.Command{
		Use:   "version",
		Short: "Print version info",
		Run: func(cmd *cobra.Command, args []string) {
			logrus.Infof("Version: %s", config.Version)
		},
	}
)

func InitCLI() *cobra.Command {

	rootCmd.PersistentFlags().IntVarP(&members, "members", "m", 3, "Initial number of quorum members")
	rootCmd.AddCommand(versionCmd)

	return rootCmd
}

func ExecuteCmd() error {

	return InitCLI().Execute()

}

func GetMembers() int {
	return members
}
