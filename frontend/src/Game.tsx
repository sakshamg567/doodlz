import { useEffect, useRef, useState } from "react"
import { type WSMessage, type Stroke, type Point } from "./types/types"
import { sendPoint, drawPoint, getTouchPos, clearAll, clearCanvas } from "./core"

const Game = ({ roomId }: { roomId: string }) => {
   const canvasRef = useRef<HTMLCanvasElement | null>(null)
   const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
   const socketRef = useRef<WebSocket | null>(null)
   const drawing = useRef(false)
   const [connectedUsers, setConnectedUsers] = useState<string[]>([])
   const [allStrokes, setAllStrokes] = useState<Stroke[]>([])
   const [currentStroke, setCurrentStroke] = useState<Point[]>([])
   const lastSentTime = useRef(0)
   const THROTTLE_MS = 16 // ~60fps

   const id = crypto.randomUUID()

   useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      const ctx = canvas.getContext("2d")
      if (ctx) {
         ctx.lineCap = "round"
         ctx.lineJoin = "round"
         ctx.strokeStyle = "#a855f7"
         ctx.lineWidth = 3
         ctxRef.current = ctx
      }

      socketRef.current = new WebSocket(`ws://localhost:3000/ws/${roomId}/${id}`)
      socketRef.current.onopen = () => console.log("Connected to WebSocket")
      socketRef.current.onmessage = handleSocketMessage
      socketRef.current.onclose = () => console.log("WebSocket closed")
      socketRef.current.onerror = (err) => console.error("WebSocket error", err)

      return () => socketRef.current?.close()
   }, [roomId])

   const handleSocketMessage = (event: MessageEvent) => {
      const message: WSMessage = JSON.parse(event.data)
      switch (message.type) {
         case "draw_point":
            drawPoint(ctxRef, message.data)
            break
         // case "stroke":

         case "clear":
            clearCanvas(canvasRef, ctxRef)
            setAllStrokes([]) // Clear stroke history
            break
         case "undo": {
            const updatedStrokes: [Stroke] = message.data.strokes || []
            setAllStrokes(updatedStrokes)
            replayAllStrokes(updatedStrokes)
            break
         }
         case "user_joined":
            setConnectedUsers(prev => [...prev, message.data.userId])
            break
         case "user_left":
            setConnectedUsers(prev => prev.filter(id => id !== message.data.userId))
            break
         case "game_state":
            replayAllStrokes(message.data.strokes || [])
            setAllStrokes(message.data.strokes || [])
            break
      }
   }

   const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
      drawing.current = true
      const { offsetX, offsetY } = e.nativeEvent
      const point = { x: offsetX, y: offsetY, type: "start" as const }

      // Initialize current stroke
      setCurrentStroke([point])

      ctxRef.current?.beginPath()
      ctxRef.current?.moveTo(offsetX, offsetY)

      sendPoint(socketRef, point)
   }

   const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {

      const now = Date.now();
      const shouldSend = now - lastSentTime.current > THROTTLE_MS;

      if (!drawing.current) return
      const { offsetX, offsetY } = e.nativeEvent
      const point = { x: offsetX, y: offsetY, type: "move" as const }

      if (shouldSend) {
         setCurrentStroke(prev => [...prev, point])
         ctxRef.current?.lineTo(offsetX, offsetY)
         ctxRef.current?.stroke()

         sendPoint(socketRef, point)
         lastSentTime.current = now;
      }
   }

   const endDraw = () => {
      if (!drawing.current) return
      drawing.current = false

      // Send complete stroke to backend
      const completedStroke: Stroke = {
         strokeColor: "#a855f7",
         strokeWidth: 3,
         paths: currentStroke
      }

      // Send stroke message to backend
      const strokeMsg: WSMessage = {
         type: "stroke",
         data: completedStroke
      }
      socketRef.current?.send(JSON.stringify(strokeMsg))

      // Add to local strokes
      setAllStrokes(prev => [...prev, completedStroke])
      setCurrentStroke([])

      sendPoint(socketRef, { x: 0, y: 0, type: "end" })
   }

   const undoLast = () => {
      // undo handled in backend, just send an undo request
      const msg: WSMessage = { type: "undo", data: {} }
      socketRef.current?.send(JSON.stringify(msg))
   }

   const replayAllStrokes = (strokes: Stroke[]) => {
      const ctx = ctxRef.current
      if (!ctx) return
      clearCanvas(canvasRef, ctxRef)
      strokes.forEach(stroke => {
         ctx.beginPath()
         stroke.paths.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y)
            else ctx.lineTo(pt.x, pt.y)
         })
         ctx.stroke()
      })
   }

   const startDrawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault() // Prevent scrolling

      const now = Date.now();
      const shouldSend = now - lastSentTime.current > THROTTLE_MS;

      drawing.current = true
      const { offsetX, offsetY } = getTouchPos(canvasRef, e)
      const point = { x: offsetX, y: offsetY, type: "start" as const }

      // Initialize current stroke
      if (shouldSend) {

         setCurrentStroke([point])

         ctxRef.current?.beginPath()
         ctxRef.current?.moveTo(offsetX, offsetY)

         sendPoint(socketRef, point)
         lastSentTime.current = now
      }
   }

   const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault() // Prevent scrolling
      if (!drawing.current) return
      const { offsetX, offsetY } = getTouchPos(canvasRef, e)
      const point = { x: offsetX, y: offsetY, type: "move" as const }

      // Add to current stroke
      setCurrentStroke(prev => [...prev, point])

      ctxRef.current?.lineTo(offsetX, offsetY)
      ctxRef.current?.stroke()

      sendPoint(socketRef, point)
   }

   const endDrawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault() // Prevent scrolling
      if (!drawing.current) return
      drawing.current = false

      // Send complete stroke to backend
      const completedStroke: Stroke = {
         strokeColor: "#a855f7",
         strokeWidth: 3,
         paths: currentStroke
      }

      // Send stroke message to backend
      const strokeMsg: WSMessage = {
         type: "stroke",
         data: completedStroke
      }
      socketRef.current?.send(JSON.stringify(strokeMsg))

      // Add to local strokes
      setAllStrokes(prev => [...prev, completedStroke])
      setCurrentStroke([])


      sendPoint(socketRef, { x: 0, y: 0, type: "end" })
   }

   return (
      <div className="h-screen min-h-screen flex flex-col items-center justify-center">
         <div className="w-100">
            <h1>{roomId}</h1>
            <h1>Draw here!</h1>
            <div className="mb-4">
               <button onClick={() => clearAll(canvasRef, ctxRef, setAllStrokes, socketRef)} className="mr-2 px-4 py-2 bg-red-500 text-white rounded">
                  Clear
               </button>
               <button onClick={undoLast} className="px-4 py-2 bg-gray-500 text-white rounded">
                  Undo
               </button>
               <div className="mt-2 text-sm">
                  Connected Users: {connectedUsers.length}
               </div>
            </div>
            <canvas
               ref={canvasRef}
               className="w-full h-[400px] border"
               onMouseDown={startDraw}
               onMouseMove={draw}
               onMouseUp={endDraw}
               onMouseLeave={endDraw}
               onTouchStart={startDrawTouch}
               onTouchMove={drawTouch}
               onTouchEnd={endDrawTouch}
               onTouchCancel={endDrawTouch}
               style={{ touchAction: 'none' }}
            />
         </div>
      </div>
   )
}

export default Game
