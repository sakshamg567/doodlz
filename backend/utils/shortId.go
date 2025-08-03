package utils

import (
	"crypto/rand"
	"encoding/hex"
)

func GenShortID() string {
	b := make([]byte, 4) // 4 bytes = 8 hex chars
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
