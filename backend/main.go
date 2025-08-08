package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/sakshamg567/doodlz/backend/utils"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

type RoomManager struct {
	Rooms map[string]*Room
	sync.RWMutex
}

type WSMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type Point struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Type string  `json:"type,omitempty"` // Add this field
}

type Stroke struct {
	StrokeColor string  `json:"strokeColor"`
	StrokeWidth int8    `json:"strokeWidth"`
	Paths       []Point `json:"paths"`
}

func (rm *RoomManager) CreateRoomHandler(c *fiber.Ctx) error {
	roomId := utils.GenShortID()

	room := &Room{
		ID:         roomId,
		Players:    make(map[string]*Player),
		HostID:     "",
		Register:   make(chan *Player, 10), // ✅ Buffered
		Unregister: make(chan *Player, 10), // ✅ Buffered
		Broadcast:  make(chan []byte, 100),
		done:       make(chan struct{}),
	}

	rm.Lock()
	rm.Rooms[roomId] = room
	rm.Unlock()

	go room.Run(rm)

	log.Println("room created : ", roomId)

	return c.JSON(fiber.Map{
		"roomId": roomId,
	})
}

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

type GameState struct {
	CurrentWord    string
	MaskedWord     string
	DrawerId       string
	Round          int
	MaxRounds      int
	GuessedPlayers map[string]bool
	State          string // waiting / playing / ended
}

// func (r *Room) StartGame() {
// r.Game := &GameState{
// CurrentWord:    randomWord(),
// DrawerId:       r.pickNextDrawer(),
// Round:          1,
// MaxRounds:      5,
// State:          "playing",
// GuessedPlayers: make(map[string]bool),
// }
// r.BroadcastGameStatus()
// }

func (r *Room) broadcast(msg []byte) {
	r.Broadcast <- msg
}

func (r *Room) broadcastExcept(sender *Player, msg []byte) {
	r.mu.Lock()
	for _, pl := range r.Players {
		if pl == sender {
			continue
		}
		select {
		case pl.send <- msg:
		default:
		}
	}
	r.mu.Unlock()
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

func (p *Player) cleanup() {
	p.once.Do(func() {
		p.cancel() // Cancel context first
		close(p.send)
		p.conn.Close()
	})
}

type Room struct {
	ID         string             `json:"roomId"`
	Players    map[string]*Player `json:"players"`
	HostID     string             `json:"hostId"`
	Register   chan *Player       `json:"-"`
	Unregister chan *Player       `json:"-"`
	Broadcast  chan []byte        `json:"-"`
	done       chan struct{}      `json:"-"`
	mu         sync.RWMutex       `json:"-"`
	Game       *GameState         `json:"-"`
	Strokes    []Stroke           `json:"strokes"`
}

func (r *Room) sendGameState(p *Player) {
	r.mu.Lock()
	gameState := WSMessage{
		Type: "game_state",
		Data: json.RawMessage([]byte(fmt.Sprintf(`{"strokes": %s}`, marshalHelper(r.Strokes)))),
	}
	r.mu.Unlock()

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
			log.Printf("🔄 Registering player %s", player.ID)
			r.mu.Lock()
			r.Players[player.ID] = player
			r.mu.Unlock()
			log.Printf("✅ Player %s registered, about to broadcast join", player.ID)

			joinedmsg := WSMessage{
				Type: "user_joined",
				Data: json.RawMessage([]byte(fmt.Sprintf(`{"playerid": "%s"}`, player.ID))),
			}

			if msgbytes, err := json.Marshal(joinedmsg); err == nil {
				r.Broadcast <- msgbytes
			}

			log.Printf("📡 Sent join broadcast for player %s", player.ID)

		case player := <-r.Unregister:
			r.mu.Lock()
			if _, exists := r.Players[player.ID]; exists {
				delete(r.Players, player.ID)
				log.Printf("player %s left room %s", player.ID, r.ID)

				// clean up empty room
				if len(r.Players) == 0 {
					r.mu.Unlock()
					rm.Lock()
					delete(rm.Rooms, r.ID)
					rm.Unlock()
					log.Printf("Room %s deleted (empty)", r.ID)
					return
				}
			}
			r.mu.Unlock()

		case msg := <-r.Broadcast:
			log.Printf("Room %s - Broadcasting message to %d players: %s", r.ID, len(r.Players), string(msg))
			r.mu.RLock()
			for playerID, p := range r.Players {
				select {
				case p.send <- msg:
					log.Printf("Room %s - Message sent to player %s", r.ID, playerID)
				case <-p.ctx.Done():
					log.Printf("Room %s - Player %s context done, skipping", r.ID, playerID)
				}
			}
			r.mu.RUnlock()
		}
	}
}

func (p *Player) readPump(r *Room) {
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
				r.mu.Lock()
				if r.Game == nil || r.Game.State == "waiting" {
					// r.StartGame()
				}
				r.mu.Unlock()

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
				// TODO: Create a helper function, to broadcast to room, except sender

				r.BroadcastWSExcept(p, "draw_point", wsMsg.Data)

			case "stroke":
				log.Printf("Player %s - Processing stroke", p.ID)
				var StrokeData Stroke

				if err := json.Unmarshal(wsMsg.Data, &StrokeData); err != nil {
					log.Printf("Player %s - Invalid stroke data: %v, data: %s", p.ID, err, string(wsMsg.Data))
					continue
				}

				log.Printf("Player %s - Stroke parsed successfully: %+v", p.ID, StrokeData)

				r.mu.Lock()
				r.Strokes = append(r.Strokes, StrokeData)
				r.mu.Unlock()

				// Broadcast stroke to other clients

				log.Printf("Player %s - Broadcasting stroke to room %s", p.ID, r.ID)
				r.BroadcastWSExcept(p, "stroke", StrokeData)

			case "test":
				log.Printf("Player %s - Processing test message", p.ID)
				r.broadcast(msg)

			case "undo":
				r.mu.Lock()
				if len(r.Strokes) > 0 {
					r.Strokes = r.Strokes[:len(r.Strokes)-1]
				}
				r.mu.Unlock()

				r.BroadcastWS("undo", `{}`)
			default:
				log.Printf("Player %s - Processing default case for type: %s", p.ID, wsMsg.Type)
				r.broadcast(msg)
			}

			log.Printf("Player %s - Finished processing message type: %s", p.ID, wsMsg.Type)
		}
	}
}

func marshalHelper(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		return "[]"
	}
	return string(data)
}

func (p *Player) writePump(r *Room) {
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

func main() {
	roomManager := &RoomManager{
		Rooms: make(map[string]*Room),
	}

	app := fiber.New()

	app.Use(cors.New())

	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	app.Get("/ws/:roomId/:playerId", websocket.New(func(c *websocket.Conn) {
		roomId := c.Params("roomId")
		playerId := c.Params("playerId")

		roomManager.RLock()
		room, ok := roomManager.Rooms[roomId]
		roomManager.RUnlock()

		if !ok {
			log.Printf("Room not found: %s", roomId)
			c.Close()
			return
		}

		ctx, cancel := context.WithCancel(context.Background())
		player := &Player{
			ID:     playerId,
			conn:   c,
			send:   make(chan []byte, 256),
			ctx:    ctx,
			cancel: cancel,
		}

		// Register player
		room.Register <- player

		// Start pumps in separate goroutines
		go player.readPump(room)
		player.writePump(room) // Run writePump in current goroutine
	}))

	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString("hello world")
	})

	app.Post("/room/create", roomManager.CreateRoomHandler)

	app.Get("/api/rooms", func(c *fiber.Ctx) error {
		roomManager.RLock()
		defer roomManager.RUnlock()

		data, err := json.Marshal(roomManager.Rooms)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to marshal rooms"})
		}
		return c.JSON(json.RawMessage(data))
	})

	app.Get("/:id", func(c *fiber.Ctx) error {
		roomId := c.Params("id")

		roomManager.RLock()
		room, ok := roomManager.Rooms[roomId]
		roomManager.RUnlock()

		if !ok {
			return c.Status(404).JSON(fiber.Map{"error": "room not found"})
		}

		room.mu.RLock()
		players := make(map[string]*Player)
		for k, v := range room.Players {
			players[k] = v
		}
		room.mu.RUnlock()

		return c.JSON(fiber.Map{
			"roomId":  room.ID,
			"hostId":  room.HostID,
			"players": players,
		})
	})

	log.Println("Server starting on :3000")
	app.Listen(":3000")
}
