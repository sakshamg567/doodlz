package room

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
)

type Player struct {
	ID     string             `json:"playerId"`
	Points int                `json:"points"`
	Name   string             `json:"name"`
	conn   *websocket.Conn    `json:"-"`
	send   chan []byte        `json:"-"`
	ctx    context.Context    `json:"-"`
	cancel context.CancelFunc `json:"-"`
	once   sync.Once          `json:"-"`
}

func NewPlayer(id string, c *websocket.Conn) *Player {
	ctx, cancel := context.WithCancel(context.Background())
	return &Player{
		ID:     id,
		conn:   c,
		send:   make(chan []byte, 256),
		ctx:    ctx,
		cancel: cancel,
	}
}

func (p *Player) cleanup() {
	p.once.Do(func() {
		p.cancel() // Cancel context first
		close(p.send)
		p.conn.Close()
	})
}

func (p *Player) ReadPump(r *Room) {
	defer func() {
		if recover := recover(); recover != nil {
			log.Printf("Player %s readPump panic: %v", p.ID, recover)
		}
		log.Printf("Player %s readPump exiting", p.ID)
		p.cleanup()
		r.Unregister <- p
	}()

	for {
		select {
		case <-p.ctx.Done():
			return
		default:
			_, msg, err := p.conn.ReadMessage()
			if err != nil {
				log.Printf("ReadMessage error for player %s: %v", p.ID, err)
				return
			}

			var wsMsg WSMessage
			if err := json.Unmarshal(msg, &wsMsg); err != nil {
				log.Printf("Invalid WS message from player %s: %v, raw message: %s", p.ID, err, string(msg))
				continue
			}

			// Add comprehensive logging
			log.Printf("Player %s - Received message type: %s, raw data: %s", p.ID, wsMsg.Type, string(wsMsg.Data))

			switch wsMsg.Type {
			case "start_game":
				log.Printf("Player %s - Processing start_game", p.ID)
				r.Mu.Lock()
				if r.Game == nil || r.Game.State == "waiting" {
					// r.StartGame()
				}
				r.Mu.Unlock()

			case "guess":
				log.Printf("Player %s - Processing guess", p.ID)
				var payload struct {
					Guess string `json:"guess"`
				}
				if err := json.Unmarshal(wsMsg.Data, &payload); err != nil {
					log.Printf("Player %s - Invalid guess payload: %v", p.ID, err)
					continue
				}
				// r.handleGuess(p, payload.Guess)

			case "draw_point":
				log.Println("broadcasting back point")

				r.BroadcastWSExcept(p, "draw_point", wsMsg.Data)

			case "stroke":
				log.Printf("Player %s - Processing stroke", p.ID)
				var StrokeData Stroke

				if err := json.Unmarshal(wsMsg.Data, &StrokeData); err != nil {
					log.Printf("Player %s - Invalid stroke data: %v, data: %s", p.ID, err, string(wsMsg.Data))
					continue
				}

				log.Printf("Player %s - Stroke parsed successfully: %+v", p.ID, StrokeData)

				r.Mu.Lock()
				r.Strokes = append(r.Strokes, StrokeData)
				r.Mu.Unlock()

				// Broadcast stroke to other clients

				log.Printf("Player %s - Broadcasting stroke to room %s", p.ID, r.ID)
				r.BroadcastWSExcept(p, "stroke", StrokeData)

			case "test":
				log.Printf("Player %s - Processing test message", p.ID)
				r.broadcast(msg)

			case "undo":
				r.Mu.Lock()
				if len(r.Strokes) > 0 {
					r.Strokes = r.Strokes[:len(r.Strokes)-1]
				}
				r.Mu.Unlock()

				r.BroadcastWS("undo", `{}`)
			default:
				log.Printf("Player %s - Processing default case for type: %s", p.ID, wsMsg.Type)
				r.broadcast(msg)
			}

			log.Printf("Player %s - Finished processing message type: %s", p.ID, wsMsg.Type)
		}
	}
}

func (p *Player) WritePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		p.cleanup()
	}()

	for {
		select {
		case <-p.ctx.Done():
			return

		case msg, ok := <-p.send:
			p.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				p.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			log.Printf("Player %s - Sending message: %s", p.ID, string(msg))

			if err := p.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Printf("WriteMessage error for player %s: %v", p.ID, err)
				return
			}

		case <-ticker.C:
			p.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := p.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Ping error for player %s: %v", p.ID, err)
				return
			}
		}
	}
}
