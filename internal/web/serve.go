package web

import (
	"context"
	"errors"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/sim"
	"github.com/sirupsen/logrus"
)

// Run starts a session and serves the visualizer on addr until SIGINT or SIGTERM.
func Run(addr string, cfg sim.Config) error {
	hub := NewHub()
	session := sim.New(cfg, hub.Publish)
	session.Start()
	defer session.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr:    addr,
		Handler: NewServer(session, hub),
		// Request contexts end on shutdown, so open event streams return immediately.
		BaseContext: func(net.Listener) context.Context { return ctx },
	}

	errCh := make(chan error, 1)
	go func() {
		logrus.Infof("Visualizer ready at %s (members: %d, slow motion: %.1fx)", displayURL(addr), cfg.Members, session.TimeScale())
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		logrus.Info("Shutting down visualizer...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			_ = srv.Close()
		}
		return nil
	}
}

func displayURL(addr string) string {
	if strings.HasPrefix(addr, ":") {
		return "http://localhost" + addr
	}
	return "http://" + addr
}
