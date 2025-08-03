import type React from "react"

export default function getTouchPos(canvasRef: React.RefObject<HTMLCanvasElement | null>, e: React.TouchEvent<HTMLCanvasElement>) {
   const canvas = canvasRef.current
   if (!canvas) return { offsetX: 0, offsetY: 0 }

   const rect = canvas.getBoundingClientRect()
   const touch = e.touches[0] || e.changedTouches[0]
   return {
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top
   }
}

