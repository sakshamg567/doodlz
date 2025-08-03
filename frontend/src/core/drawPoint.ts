import type React from "react"
import { type Point } from "../types/types"

export default function drawIncomingPoint(ctxRef: React.RefObject<CanvasRenderingContext2D | null>, point: Point) {
   const ctx = ctxRef.current
   if (!ctx) return

   if (point.type === "start") {
      ctx.beginPath()
      ctx.moveTo(point.x, point.y)
   } else if (point.type === "move") {
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
   }
}
