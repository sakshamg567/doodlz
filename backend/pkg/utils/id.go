package utils

import (
	"crypto/rand"
	"encoding/base64"
)

// GenShortID generates a random base64 encoded string to be used as a unique identifier.
func GenShortID() string {
	b := make([]byte, 6) // 6 bytes will give us a 8-character base64 string
	_, err := rand.Read(b)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
