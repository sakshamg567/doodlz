package room

import "encoding/json"

const (
	GamePhaseLobby        = "lobby"
	GamePhaseChoosingWord = "choosing_word"
	GamePhaseDrawing      = "drawing"
	GamePhaseRoundEnd     = "round_end"
	GamePhaseGameEnd      = "game_end"

	TypeGameState  = "game_state"
	TypeUserJoined = "user_joined"
)

type GameState struct {
	Phase          string          `json:"phase"`
	Round          int             `json:"round"`
	MaxRounds      int             `json:"maxRounds"`
	DrawerID       string          `json:"drawerId"`
	WordMask       string          `json:"wordMask"`
	WordLen        string          `json:"wordLen"`
	StartedAtUnix  int64           `json:"startedAt"`
	EndsAtUnix     int64           `json:"endsAt"`
	GuessedPlayers map[string]bool `json:"-"`

	// internal
	word           string `json:"-"`
	chooseDeadline int64  `json:"-"`
}

type RoomSnapshot struct {
	RoomID  string          `json:"roomId"`
	Players []PlayerSummary `json:"players"`
	Game    *GameState      `json:"game,omitempty"`
	Strokes []Stroke        `json:"strokes,omitempty"`
	HostID  string          `json:"hostId,omitempty"`
}

// non-ephemeral player sessions (for rejoins)
type PlayerSession struct {
	ID      string
	Name    string
	Points  int
	Online  bool
	Guessed bool
}

type WSMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type Point struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Color string  `json:"color"`
	Type  string  `json:"type,omitempty"`
}

type Stroke struct {
	StrokeColor string  `json:"strokeColor"`
	StrokeWidth int8    `json:"strokeWidth"`
	Paths       []Point `json:"paths"`
}

type PlayerSummary struct {
	ID     string `json:"playerId"`
	Points int    `json:"points"`
	Name   string `json:"name"`
}
