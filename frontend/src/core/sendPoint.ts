import type React from "react"
import { type WSMessage, type Point } from "../types/types"

export default function sendPoint(socketRef: React.RefObject<WebSocket | null>, point: Point) {
   const msg: WSMessage = {
      type: "draw_point",
      data: point
   }
   socketRef.current?.send(JSON.stringify(msg))
}
