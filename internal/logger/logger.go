package logger

import (
	"io"
	"os"
	"strings"

	"github.com/Anthya1104/quorum-election-cli/internal/config"
	"github.com/sirupsen/logrus"
)

func InitLogger(level string) error {
	file, _ := os.OpenFile(config.LogFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	mw := io.MultiWriter(os.Stdout, file)
	logrus.SetOutput(mw)

	if err := setLevel(level); err != nil {
		return err
	}
	logrus.SetFormatter(&logrus.TextFormatter{
		FullTimestamp: true,
	})
	return nil
}

func setLevel(level string) error {
	lvl, err := logrus.ParseLevel(strings.ToLower(level))
	if err != nil {
		return err
	}

	logrus.SetLevel(lvl)
	return nil
}
