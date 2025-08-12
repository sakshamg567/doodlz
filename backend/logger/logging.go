package logger

import (
	"log"
	"os"
)

var (
	enabled = true // flip to false to nuke logs
	logger  = log.New(os.Stdout, "", log.LstdFlags)
)

func EnableLogging(b bool) {
	enabled = b
}

func Info(msg string, v ...interface{}) {
	if !enabled {
		return
	}

	logger.Printf(msg, v...)

}

func Error(msg string, v ...interface{}) {
	if !enabled {
		return
	}
	logger.Printf("[ERROR] "+msg, v...)
}
