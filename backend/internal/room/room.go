package room

import (
	"encoding/json"
	"fmt"
	"sync"
)

type Room struct {
	ID         string             `json:"roomId"`
	Players    map[string]*Player `json:"players"`
	HostID     string             `json:"hostId"`
	Register   chan *Player       `json:"-"`
	Unregister chan *Player       `json:"-"`
	Broadcast  chan []byte        `json:"-"`
	done       chan struct{}      `json:"-"`
	Mu         sync.RWMutex       `json:"-"`
	Game       *GameState         `json:"-"`
	Strokes    []Stroke           `json:"strokes"`
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

		if msgBytes, err := json.Marshal(msg); err == nil {
			r.broadcast(msgBytes)
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

		if msgBytes, err := json.Marshal(msg); err == nil {
			r.broadcastExcept(s, msgBytes)
		}
	}
}

func (r *Room) sendGameState(p *Player) {
	r.Mu.Lock()

	strokeData, err := json.Marshal(r.Strokes)

	gameState := WSMessage{
		Type: "game_state",
		Data: json.RawMessage([]byte(fmt.Sprintf(`{"strokes": %s}`, string(strokeData)))),
	}
	r.Mu.Unlock()

	if msgBytes, err := json.Marshal(gameState); err == nil {
		select {
		case p.send <- msgBytes:
		default:
		}
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

			joinedmsg := WSMessage{
				Type: "user_joined",
				Data: json.RawMessage([]byte(fmt.Sprintf(`{"playerid": "%s"}`, player.ID))),
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
