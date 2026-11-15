package cobra

import (
	"github.com/Anthya1104/quorum-election-cli/internal/config"
	"github.com/Anthya1104/quorum-election-cli/internal/service"
	"github.com/Anthya1104/quorum-election-cli/internal/sim"
	"github.com/Anthya1104/quorum-election-cli/internal/web"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var members int
var serveAddr string
var serveSlowmo float64
var rootCmd = &cobra.Command{
	Use:   "app",
	Short: "A base CLI app with Cobra and logrus",
	Run: func(cmd *cobra.Command, args []string) {
		logrus.Debugf("Hello from the base CLI app!")
	},
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print version info",
	Run: func(cmd *cobra.Command, args []string) {
		logrus.Infof("Version: %s", config.Version)
	},
}

var playCmd = &cobra.Command{
	Use:   "play",
	Short: "start quorum election game play",
	Run: func(cmd *cobra.Command, args []string) {
		service.RunQuorumSetup(members)
	},
}

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "start the 3D election visualizer in the browser",
	RunE: func(cmd *cobra.Command, args []string) error {
		return web.Run(serveAddr, sim.Config{Members: members, TimeScale: serveSlowmo})
	},
}

func InitCLI() *cobra.Command {

	rootCmd.PersistentFlags().IntVarP(&members, "members", "m", 3, "Initial number of quorum members")

	serveCmd.Flags().StringVar(&serveAddr, "addr", ":8080", "Address to serve the visualizer on")
	serveCmd.Flags().Float64Var(&serveSlowmo, "slowmo", 3, "Slow-motion factor applied to every election timer (1 = real time)")

	rootCmd.AddCommand(playCmd)
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(versionCmd)

	return rootCmd
}

func ExecuteCmd() error {

	return InitCLI().Execute()

}
