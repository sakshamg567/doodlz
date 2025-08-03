package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const (
	createRoomURL = "http://localhost:3000/room/create"
	wsURL         = "ws://localhost:3000/ws"
)

type WSMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

func main() {
	args := os.Args
	if len(args) < 2 {
		log.Fatal("Usage: go run test.go <number_of_clients> [game_link]")
	}

	numClients, err := strconv.Atoi(args[1])
	if err != nil {
		log.Fatal("Invalid number of clients:", err)
	}

	var roomId string

	// Check if game link is provided
	if len(args) >= 3 {
		gameLink := args[2]
		roomId = extractRoomIdFromLink(gameLink)
		if roomId == "" {
			log.Fatal("Could not extract roomId from game link:", gameLink)
		}
		fmt.Println("Using existing room:", roomId)
	} else {
		roomId = createRoom()
		fmt.Println("Created room:", roomId)
	}

	time.Sleep(1 * time.Second) // wait a sec for room to spin up

	for i := 0; i < numClients; i++ {
		go connectAndSpam(roomId, fmt.Sprintf("player%d", i))
	}

	select {} // block forever (let goroutines run)
}

func extractRoomIdFromLink(gameLink string) string {
	// Parse the URL to extract query parameters
	u, err := url.Parse(gameLink)
	if err != nil {
		log.Printf("Error parsing URL: %v", err)
		return ""
	}

	// Get roomId from query parameters (standard format)
	roomId := u.Query().Get("roomId")
	if roomId != "" {
		return roomId
	}

	// Handle direct roomId after ? (like localhost:5173/?9a0edb5c)
	if u.RawQuery != "" && !strings.Contains(u.RawQuery, "=") {
		// If RawQuery has no equals sign, it's likely just the roomId
		return u.RawQuery
	}

	// Try to extract from fragment if it's a single-page app
	if u.Fragment != "" {
		// Handle cases like localhost:5173/#/?roomId=xyz
		if strings.Contains(u.Fragment, "roomId=") {
			parts := strings.Split(u.Fragment, "roomId=")
			if len(parts) > 1 {
				roomIdPart := strings.Split(parts[1], "&")[0] // Get part before next parameter
				return roomIdPart
			}
		}
		// Handle direct roomId in fragment (like localhost:5173/#/9a0edb5c)
		if !strings.Contains(u.Fragment, "=") {
			// Remove leading slash if present
			fragment := strings.TrimPrefix(u.Fragment, "/")
			if fragment != "" {
				return fragment
			}
		}
	}

	return ""
}

func createRoom() string {
	resp, err := http.Post(createRoomURL, "application/json", nil)
	if err != nil {
		log.Fatal("Failed to create room:", err)
	}
	defer resp.Body.Close()

	var res struct {
		RoomID string `json:"roomId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		log.Fatal("Invalid JSON from room creation:", err)
	}

	return res.RoomID
}

func connectAndSpam(roomId, playerId string) {
	url := fmt.Sprintf("%s/%s/%s", wsURL, roomId, playerId)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		log.Println("WS connect error:", err)
		return
	}
	defer conn.Close()

	fmt.Printf("%s joined\n", playerId)

	// Create different message types to test
	messages := []WSMessage{
		{
			Type: "chat",
			Data: json.RawMessage(fmt.Sprintf(`{"message":"Hello from %s","playerId":"%s"}`, playerId, playerId)),
		},
		{
			Type: "drawing",
			Data: json.RawMessage(fmt.Sprintf(`{"x":%d,"y":%d,"color":"#000000","playerId":"%s"}`, rand.Intn(800), rand.Intn(600), playerId)),
		},
		{
			Type: "guess",
			Data: json.RawMessage(fmt.Sprintf(`{"guess":"test guess from %s"}`, playerId)),
		},
	}

	for i := 0; i < 100; i++ { // Send 100 messages then stop
		// Pick a random message type
		msg := messages[rand.Intn(len(messages))]

		msgBytes, err := json.Marshal(msg)
		if err != nil {
			log.Printf("JSON marshal error for %s: %v", playerId, err)
			continue
		}

		err = conn.WriteMessage(websocket.TextMessage, msgBytes)
		if err != nil {
			log.Printf("Write error for %s: %v", playerId, err)
			return
		}

		// Random delay between 100-1000ms
		time.Sleep(time.Duration(100+rand.Intn(900)) * time.Millisecond)
	}

	fmt.Printf("%s finished sending messages\n", playerId)
}
