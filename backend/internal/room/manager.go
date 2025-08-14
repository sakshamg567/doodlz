package room

import (
	"encoding/json"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/sakshamg567/doodlz/backend/pkg/utils"
)

type RoomManager struct {
	Rooms map[string]*Room
	sync.RWMutex
}

func NewRoomManager() *RoomManager {
	return &RoomManager{
		Rooms: make(map[string]*Room),
	}
}

func (rm *RoomManager) CreateRoomHandler(c *fiber.Ctx) error {
	reqBody := c.Body()

	var body struct {
		HostId string `json:"hostId"`
	}

	json.Unmarshal(reqBody, &body)

	roomId := utils.GenShortID()

	room := &Room{
		ID:         roomId,
		Players:    make(map[string]*Player),
		HostID:     body.HostId,
		Register:   make(chan *Player, 10), // ✅ Buffered
		Unregister: make(chan *Player, 10), // ✅ Buffered
		Broadcast:  make(chan []byte, 100),
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

func (rm *RoomManager) GetRoom(id string) (*Room, bool) {
	rm.RLock()
	defer rm.RUnlock()
	r, ok := rm.Rooms[id]
	return r, ok
}

func (rm *RoomManager) MarshalRooms() ([]byte, error) {
	rm.RLock()
	defer rm.RUnlock()
	return json.Marshal(rm.Rooms)
}
