package utils

import (
	"errors"
	"math/rand"
	"os"
	"strings"
	"sync"
)

const wordBankPath = "skribbl-word-bank/skribbl_words_drawability_en.txt"

var (
	loadOnce sync.Once
	wordList []string
	loadErr  error
)

func loadWords() error {
	data, err := os.ReadFile(wordBankPath)
	if err != nil {
		return err
	}
	lines := strings.Split(string(data), "\n")
	tmp := make([]string, 0, len(lines))
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l != "" {
			tmp = append(tmp, l)
		}
	}
	if len(tmp) == 0 {
		return errors.New("word bank empty after parsing")
	}

	wordList = tmp
	return nil
}

func GetRandomWord(difficulty int) (string, error) {
	loadOnce.Do(func() {
		loadErr = loadWords()
	})
	if loadErr != nil {
		return "", loadErr
	}
	if len(wordList) == 0 {
		return "", errors.New("no words in wordlist")
	}

	idx := rand.Intn(len(wordList))
	return wordList[idx], nil
}
