package room

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/agnivade/levenshtein"
	"github.com/sakshamg567/doodlz/backend/logger"
)

type Room struct {
	ID         string
	Players    map[string]*Player
	Sessions   map[string]*PlayerSession
	HostID     string
	Register   chan *Player
	Unregister chan *Player
	Broadcast  chan []byte
	done       chan struct{}
	Mu         sync.RWMutex
	Game       *GameState
	Strokes    []Stroke

	//internal
	timerTicker *time.Ticker
	stopTimer   chan struct{}
}

func (r *Room) broadcast(msg []byte) {
	r.Broadcast <- msg
}

func (r *Room) broadcastExcept(sender *Player, msg []byte) {
	r.Mu.Lock()
	for _, pl := range r.Players {
		if pl == sender {
			continue
		}
		select {
		case pl.send <- msg:
		default:
		}
	}
	r.Mu.Unlock()
}

func (r *Room) BroadcastWS(t string, d any) {
	data, err := json.Marshal(d)
	if err == nil {
		msg := WSMessage{
			Type: t,
			Data: data,
		}

		if payload, err := json.Marshal(msg); err == nil {
			r.broadcast(payload)
		}
	}
}

func (r *Room) handleGuess(p *Player, wsMsg WSMessage) {
	start := time.Now()

	var payload struct {
		Guess   string `json:"guess"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(wsMsg.Data, &payload); err != nil {
		logger.Info("handleGuess: player=%s invalid payload err=%v", p.ID, err)
		return
	}

	raw := strings.TrimSpace(func() string {
		if payload.Guess != "" {
			return payload.Guess
		}
		return payload.Message
	}())
	if raw == "" {
		logger.Info("handleGuess: player=%s empty input", p.ID)
		return
	}

	guessLower := strings.ToLower(raw)

	playerID := p.ID
	playerName := p.Name

	// Decision flags collected under lock
	var (
		isGuessContext bool
		correct        bool
		closeDistance  int
		sendCloseHint  bool
		alreadyGuessed bool
	)

	logger.Info("handleGuess: player=%s acquiring lock", p.ID)
	r.Mu.Lock()

	game := r.Game
	if game != nil &&
		game.Phase == GamePhaseDrawing &&
		game.word != "" &&
		playerID != game.DrawerID {

		isGuessContext = true

		if game.GuessedPlayers == nil {
			game.GuessedPlayers = make(map[string]bool)
		}

		if game.GuessedPlayers[playerID] {
			alreadyGuessed = true
		} else {
			target := strings.ToLower(game.word)
			dist := levenshtein.ComputeDistance(guessLower, target)

			if dist == 0 {
				game.GuessedPlayers[playerID] = true
				timeLeft := game.EndsAtUnix - time.Now().Unix()
				if timeLeft < 0 {
					timeLeft = 0
				}
				p.Points += 100 + int(timeLeft)
				correct = true
			} else if dist <= 2 {
				closeDistance = dist
				sendCloseHint = true
			}
		}
	}

	r.Mu.Unlock()
	logger.Info("handleGuess: player=%s released lock (guessCtx=%v correct=%v close=%v already=%v) elapsed=%s",
		p.ID, isGuessContext, correct, sendCloseHint, alreadyGuessed, time.Since(start))

	// Post-lock actions
	if alreadyGuessed {
		// Echo original text only to that player (optional)
		r.WsMsgTo(p, "message", struct {
			Type string `json:"type"`
			Data struct {
				Sender struct {
					ID   string `json:"ID"`
					Name string `json:"Name"`
				} `json:"sender"`
				Message string `json:"message"`
			} `json:"data"`
		}{
			Type: "chat_msg",
			Data: struct {
				Sender struct {
					ID   string `json:"ID"`
					Name string `json:"Name"`
				} `json:"sender"`
				Message string `json:"message"`
			}{
				Sender: struct {
					ID   string `json:"ID"`
					Name string `json:"Name"`
				}{
					ID:   playerID,
					Name: playerName,
				},
				Message: raw,
			},
		})
		return
	}

	if correct {
		logger.Info("handleGuess: player=%s correct guess broadcast", p.ID)
		r.BroadcastWS("message", struct {
			Type string `json:"type"`
			Data struct {
				PlayerID   string `json:"playerId"`
				PlayerName string `json:"playerName"`
				Message    string `json:"message"`
			} `json:"data"`
		}{
			Type: "correct_guess",
			Data: struct {
				PlayerID   string `json:"playerId"`
				PlayerName string `json:"playerName"`
				Message    string `json:"message"`
			}{
				PlayerID:   playerID,
				PlayerName: playerName,
				Message:    playerName + " has guessed the word",
			},
		})
		return
	}

	if isGuessContext && sendCloseHint {
		logger.Info("handleGuess: player=%s close guess dist=%d", p.ID, closeDistance)

		type CloseGuess struct {
			Type string      `json:"type"`
			Data interface{} `json:"data"`
		}

		// Full distance only to guesser
		r.WsMsgTo(p, "message", CloseGuess{
			Type: "close_guess",
			Data: struct {
				PlayerID     string `json:"playerId"`
				PlayerName   string `json:"playerName"`
				EditDistance int    `json:"editDistance"`
				Message      string `json:"message"`
			}{
				PlayerID:     playerID,
				PlayerName:   playerName,
				EditDistance: closeDistance,
				Message:      guessLower,
			},
		})
		// Masked (0) to others
		r.BroadcastWSExcept(p, "message", CloseGuess{
			Type: "close_guess",
			Data: struct {
				PlayerID     string `json:"playerId"`
				PlayerName   string `json:"playerName"`
				EditDistance int    `json:"editDistance"`
				Message      string `json:"message"`
			}{
				PlayerID:     playerID,
				PlayerName:   playerName,
				EditDistance: 0,
				Message:      guessLower,
			},
		})
		return
	}

	// Normal chat
	logger.Info("handleGuess: player=%s normal chat broadcast", p.ID)
	r.BroadcastWS("message", struct {
		Type string      `json:"type"`
		Data interface{} `json:"data"`
	}{
		Type: "chat_msg",
		Data: struct {
			Sender struct {
				ID   string `json:"ID"`
				Name string `json:"Name"`
			} `json:"sender"`
			Message string `json:"message"`
		}{
			Sender: struct {
				ID   string `json:"ID"`
				Name string `json:"Name"`
			}{
				ID:   playerID,
				Name: playerName,
			},
			Message: raw,
		},
	})
}

func (r *Room) WsMsgTo(p *Player, event string, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	msgBytes, err := json.Marshal(WSMessage{Type: event, Data: data})
	if err != nil {
		return
	}
	for _, pl := range r.Players {
		if pl == p {
			select {
			case pl.send <- msgBytes:
			default:
			}
			break
		}
	}
}

func (r *Room) isHost(p *Player) bool {
	return p != nil && p.ID == r.HostID
}

func (r *Room) BroadcastPoint(s *Player, t string, d any) {
	if !r.isHost(s) {
		return
	}
	r.BroadcastWSExcept(s, t, d)
}

func (r *Room) BroadcastWSExcept(s *Player, t string, d any) {

	data, err := json.Marshal(d)
	if err == nil {
		msg := WSMessage{
			Type: t,
			Data: data,
		}

		if payload, err := json.Marshal(msg); err == nil {
			r.broadcastExcept(s, payload)
		}
	}
}

func (r *Room) SendGameState(p *Player) {
	r.Mu.RLock()
	defer r.Mu.RUnlock()

	// copy current strokes
	strokes := make([]Stroke, len(r.Strokes))
	copy(strokes, r.Strokes)

	// get player summary
	players := make([]PlayerSummary, 0, len(r.Players))
	for _, v := range r.Players {
		players = append(players, PlayerSummary{
			ID:     v.ID,
			Points: v.Points,
			Name:   v.Name,
		})
	}

	hostID := r.HostID
	roomID := r.ID

	// copy current game state or create default
	var game *GameState
	if r.Game != nil {
		g := *r.Game
		game = &g
	} else {
		game = &GameState{
			Phase:          GamePhaseLobby,
			MaxRounds:      0,
			Round:          3,
			DrawerID:       "",
			WordMask:       "",
			WordLen:        "",
			StartedAtUnix:  0,
			EndsAtUnix:     0,
			GuessedPlayers: make(map[string]bool),
		}
	}

	snapshot := RoomSnapshot{
		RoomID:  roomID,
		HostID:  hostID,
		Players: players,
		Strokes: strokes,
		Game:    game,
	}

	r.sendWSMessageToPlayer(p, TypeGameState, snapshot)

}

func (r *Room) sendWSMessageToPlayer(p *Player, msgType string, data any) {
	logger.Info("Sending %s to player: %s", msgType, p.ID)

	payload, err := json.Marshal(data)
	if err != nil {
		logger.Error("Failed to marshal data for player %s: %v", p.ID, err)
		return
	}

	wsMsg := WSMessage{
		Type: msgType,
		Data: payload,
	}

	msgBytes, err := json.Marshal(wsMsg)
	if err != nil {
		logger.Error("Failed to marshal WSMessage for player %s: %v", p.ID, err)
		return
	}

	select {
	case p.send <- msgBytes:
		logger.Info("Successfully queued message for player: %s", p.ID)
	default:
		logger.Error("Player %s send channel is full or closed", p.ID)
	}
}

func (r *Room) Run(rm *RoomManager) {
	defer close(r.done)

	for {
		select {

		case player := <-r.Register:
			r.Mu.Lock()
			r.Players[player.ID] = player
			r.Mu.Unlock()

			r.SendGameState(player)

			r.Mu.RLock()
			players := r.Players
			r.Mu.RUnlock()

			payload, err := json.Marshal(players)
			if err != nil {
				logger.Error("player struct marshal error")
			}

			joinedmsg := WSMessage{
				Type: TypeUserJoined,
				Data: payload,
			}

			if msgbytes, err := json.Marshal(joinedmsg); err == nil {
				r.Broadcast <- msgbytes
			}

		case player := <-r.Unregister:
			r.Mu.Lock()
			if _, exists := r.Players[player.ID]; exists {
				delete(r.Players, player.ID)

				// clean up empty room
				if len(r.Players) == 0 {
					r.Mu.Unlock()
					rm.Lock()
					delete(rm.Rooms, r.ID)
					rm.Unlock()
					return
				}
			}
			r.Mu.Unlock()

		case msg := <-r.Broadcast:
			r.Mu.RLock()
			for _, p := range r.Players {
				select {
				case p.send <- msg:
				case <-p.ctx.Done():
				}
			}
			r.Mu.RUnlock()
		}
	}
}
