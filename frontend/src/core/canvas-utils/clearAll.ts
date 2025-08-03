import type React from "react"
import type { Stroke, WSMessage } from "../../types/types"

export const clearCanvas = (canvasRef: React.RefObject<HTMLCanvasElement | null>, ctxRef: React.RefObject<CanvasRenderingContext2D | null>) => {
   const canvas = canvasRef.current
   if (!canvas || !ctxRef.current) return
   ctxRef.current.clearRect(0, 0, canvas.width, canvas.height)
}

export function clearAll(canvasRef: React.RefObject<HTMLCanvasElement | null>, ctxRef: React.RefObject<CanvasRenderingContext2D | null>, setAllStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>, socketRef: React.RefObject<WebSocket | null>) {
   clearCanvas(canvasRef, ctxRef)
   setAllStrokes([])

   // Send clear message to other users
   const msg: WSMessage = { type: "clear", data: {} }
   socketRef.current?.send(JSON.stringify(msg))
}

