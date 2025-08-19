package utils

import (
	"crypto/rand"
)

var charset = []byte("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_")

// GenShortID generates a random base64 encoded string to be used as a unique identifier.
func GenShortID() string {
	b := make([]byte, 6) // 6 bytes will give us a 8-character base64 string
	_, err := rand.Read(b)
	if err != nil {
		return ""
	}

	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}

	return string(b)
}
