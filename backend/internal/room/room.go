package room

import (
	"encoding/json"
	"sync"
	"time"

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
