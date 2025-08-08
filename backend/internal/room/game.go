package room

type GameState struct {
	CurrentWord    string          `json:"currentWord"`
	MaskedWord     string          `json:"maskedWord"`
	DrawerID       string          `json:"drawerId"`
	Round          int             `json:"round"`
	MaxRounds      int             `json:"maxRounds"`
	GuessedPlayers map[string]bool `json:"guessedPlayers"`
	State          string          `json:"state"` // waiting / playing / ended
}

// implement gamestate functionalities
