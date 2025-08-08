package room

import "encoding/json"

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
