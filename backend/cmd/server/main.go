package main

import (
	"encoding/json"
	"log"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"

	"github.com/sakshamg567/doodlz/backend/internal/room"
)

func main() {
	rm := room.NewRoomManager()
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
		roomID := c.Params("roomId")
		playerID := c.Params("playerId")

		r, ok := rm.GetRoom(roomID)
		if !ok {
			c.Close()
			return
		}

		pl := room.NewPlayer(playerID, c)
		r.Register <- pl
		go pl.ReadPump(r)
		pl.WritePump()
	}))

	app.Post("/room/create", rm.CreateRoomHandler)

	app.Get("/api/rooms", func(c *fiber.Ctx) error {
		b, err := rm.MarshalRooms()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "marshal error"})
		}
		return c.JSON(json.RawMessage(b))
	})

	app.Get("/room/:id", func(c *fiber.Ctx) error {
		r, ok := rm.GetRoom(c.Params("id"))
		if !ok {
			return c.Status(404).JSON(fiber.Map{"error": "room not found"})
		}
		r.Mu.RLock()
		players := make(map[string]any, len(r.Players))
		for k, v := range r.Players {
			players[k] = struct {
				ID     string `json:"playerId"`
				Points int    `json:"points"`
				Name   string `json:"name"`
			}{v.ID, v.Points, v.Name}
		}
		r.Mu.RUnlock()
		return c.JSON(fiber.Map{
			"roomId":  r.ID,
			"hostId":  r.HostID,
			"players": players,
		})
	})

	app.Get("/", func(c *fiber.Ctx) error { return c.SendString("ok") })

	log.Println("Server :3000")
	_ = app.Listen(":3000")
}
