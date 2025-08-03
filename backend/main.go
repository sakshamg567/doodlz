package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"doodlz/utils"

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
	X float64 `json:"x"`
	Y float64 `json:"y"`
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
		Register:   make(chan *Player),
		Unregister: make(chan *Player),
		Broadcast:  make(chan []byte),
		done:       make(chan struct{}),
	}

	rm.Lock()
	rm.Rooms[roomId] = room
	rm.Unlock()

	go room.Run(rm)

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
			r.mu.Lock()
			r.Players[player.ID] = player

			go r.sendGameState(player)

			// Broadcast player joined
			joinedMsg := WSMessage{
				Type: "user_joined",
				Data: json.RawMessage([]byte(fmt.Sprintf(`{"playerId": "%s"}`, player.ID))),
			}

			if msgBytes, err := json.Marshal(joinedMsg); err == nil {
				r.Broadcast <- msgBytes
			}

			log.Printf("Player %s joined room %s", player.ID, r.ID)
			r.mu.Unlock()

		case player := <-r.Unregister:
			r.mu.Lock()
			if _, exists := r.Players[player.ID]; exists {
				delete(r.Players, player.ID)
				log.Printf("Player %s left room %s", player.ID, r.ID)

				// Clean up empty room
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
			r.mu.RLock()
			for _, p := range r.Players {
				select {
				case p.send <- msg:
				case <-p.ctx.Done():
					// Player disconnected, skip
				default:
					// Channel full, player likely disconnected
					go func(player *Player) {
						r.Unregister <- player
					}(p)
				}
			}
			r.mu.RUnlock()
		}
	}
}

func (p *Player) readPump(r *Room) {
	defer func() {
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
				log.Println("Invalid WS message:", err)
				continue
			}

			switch wsMsg.Type {
			case "start_game":
				r.mu.Lock()
				if r.Game == nil || r.Game.State == "waiting" {
					// r.StartGame()
				}
				r.mu.Unlock()

			case "guess":
				var payload struct {
					Guess string `json:"guess"`
				}
				if err := json.Unmarshal(wsMsg.Data, &payload); err != nil {
					log.Println("Invalid guess payload:", err)
					continue
				}
				// r.handleGuess(p, payload.Guess)
			case "stroke":

				var StrokeData Stroke

				if err := json.Unmarshal(wsMsg.Data, &StrokeData); err != nil {
					log.Println("Invalid stroke data : ", err)
				}

				r.Strokes = append(r.Strokes, StrokeData)

				fmt.Println("STROKE :", StrokeData)
			case "undo":
				r.mu.Lock()
				if len(r.Strokes) > 0 {
					r.Strokes = r.Strokes[:len(r.Strokes)-1]
				}

				undoMsg := WSMessage{
					Type: "undo",
					Data: json.RawMessage(fmt.Sprintf(`{"strokes": %s}`, marshalHelper(r.Strokes))),
				}

				r.mu.Unlock()
				if msgBytes, err := json.Marshal(undoMsg); err == nil {
					r.Broadcast <- msgBytes
				}

			case "clear":
				r.mu.Lock()
				r.Strokes = []Stroke{}
				r.mu.Unlock()
				r.Broadcast <- msg
			default:
				r.Broadcast <- msg
			}
		}
	}
}

func marshalHelper(v interface{}) string {
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
