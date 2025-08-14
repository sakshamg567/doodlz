import { useEffect, useRef, useState } from "react"
import { type WSMessage, type Stroke, type Point, type Player } from "./types/types"
import { sendPoint, drawPoint, getTouchPos, clearAll, clearCanvas } from "./core"
import { getOrCreateGuestId } from "./core/lib/guesId"
import { Input } from "./components/ui/input";

// Classic MS Paint style color palette
const PALETTE = [
   "#000000", "#808080", "#FFFFFF",
   "#800000", "#FF0000", "#FFA500", "#FFFF00",
   "#008000", "#00FF00", "#008080", "#00FFFF",
   "#000080", "#0000FF", "#800080", "#FF00FF",
   "#964B00"
];

const Game = ({ roomId }: { roomId: string }) => {
   const canvasRef = useRef<HTMLCanvasElement | null>(null)
   const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
   const socketRef = useRef<WebSocket | null>(null)
   const drawing = useRef(false)
   const [connectedUsers, setConnectedUsers] = useState<Player[] | []>([])
   const [allStrokes, setAllStrokes] = useState<Stroke[]>([])
   const [currentStroke, setCurrentStroke] = useState<Point[]>([])
   const [isHost, setIsHost] = useState<boolean>(false)
   const [strokeColor, setStrokeColor] = useState("#000000");
   // optional: stroke size
   const [strokeWidth, setStrokeWidth] = useState(3);

   const lastSentTime = useRef(0)
   const THROTTLE_MS = 16 // ~60fps

   const id = getOrCreateGuestId();
   console.log(id);


   useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      const ctx = canvas.getContext("2d")
      if (ctx) {
         ctx.lineCap = "round";
         ctx.lineJoin = "round";
         ctx.strokeStyle = strokeColor;
         ctx.lineWidth = strokeWidth;
         ctxRef.current = ctx;
         // paint-style solid white background
         ctx.fillStyle = "#ffffff";
         ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      socketRef.current = new WebSocket(`ws://localhost:3000/ws/${roomId}/${id}`)
      socketRef.current.onopen = () => console.log("Connected to WebSocket")
      socketRef.current.onmessage = handleSocketMessage
      socketRef.current.onclose = () => console.log("WebSocket closed")
      socketRef.current.onerror = (err) => console.error("WebSocket error", err)

      return () => socketRef.current?.close()
   }, [roomId])

   // If user changes color / width, just update context for next stroke
   useEffect(() => {
      if (ctxRef.current) {
         ctxRef.current.strokeStyle = strokeColor;
         ctxRef.current.lineWidth = strokeWidth;
      }
   }, [strokeColor, strokeWidth]);

   const handleSocketMessage = (event: MessageEvent) => {
      const message: WSMessage = JSON.parse(event.data)


      // 
      console.log("message : ", message);


      switch (message.type) {
         case "draw_point":
            drawPoint(ctxRef, message.data)
            break
         case "stroke": {
            const newStroke: Stroke = message.data
            setAllStrokes((prev) => [...prev, newStroke])
            break
         }
         case "clear":
            clearCanvas(canvasRef, ctxRef)
            setAllStrokes([]) // Clear stroke history
            break
         case "undo": {
            setAllStrokes(prev => {
               if (prev.length === 0) return prev
               const updated = prev.slice(0, -1)
               replayAllStrokes(updated)
               return updated
            })
            break
         }
         case "user_joined": {
            const users = Object.values(message.data)
            setConnectedUsers(users as Player[])
            break
         }
         case "user_left":
            setConnectedUsers(prev => prev.filter(id => id !== message.data.userId))
            break
         case "game_state":
            replayAllStrokesWithDelay(message.data.strokes || [])
            setAllStrokes(message.data.strokes || [])

            console.log(message.data.hostId);


            if (message.data.hostId) {
               setIsHost(message.data.hostId === id)
            }
            break
      }
   }

   const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isHost) return;
      drawing.current = true;
      const { offsetX, offsetY } = e.nativeEvent;
      ctxRef.current?.beginPath();
      ctxRef.current?.moveTo(offsetX, offsetY);
      const point = { x: offsetX, y: offsetY, type: "start" as const };
      setCurrentStroke([point]);
      sendPoint(socketRef, point); // (optionally include color/width)
   }

   const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isHost) return
      if (!drawing.current) return
      const now = Date.now();
      const shouldSend = now - lastSentTime.current > THROTTLE_MS;

      const { offsetX, offsetY } = e.nativeEvent
      const point = { x: offsetX, y: offsetY, type: "move" as const }

      setCurrentStroke(prev => [...prev, point]);
      ctxRef.current?.lineTo(offsetX, offsetY)
      ctxRef.current?.stroke()

      if (shouldSend) {
         sendPoint(socketRef, point)
         lastSentTime.current = now;
      }
   }

   const endDraw = () => {
      if (!isHost) return
      if (!drawing.current) return
      drawing.current = false

      // Send complete stroke to backend
      const completedStroke: Stroke = {
         strokeColor,
         strokeWidth,
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
      if (!isHost) return
      // undo handled in backend, just send an undo request
      const msg: WSMessage = { type: "undo", data: {} }
      socketRef.current?.send(JSON.stringify(msg))
   }

   const replayAllStrokes = (strokes: Stroke[]) => {
      const ctx = ctxRef.current
      if (!ctx) return
      clearCanvas(canvasRef, ctxRef)
      strokes.forEach(stroke => {
         ctx.beginPath();
         ctx.strokeStyle = stroke.strokeColor || "#000000";
         ctx.lineWidth = stroke.strokeWidth || 3;
         stroke.paths.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
         });
         ctx.stroke();
      });
      // restore current selection
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
   }

   const replayAllStrokesWithDelay = (strokes: Stroke[]) => {
      const ctx = ctxRef.current
      if (!ctx) return
      clearCanvas(canvasRef, ctxRef)

      let s = 0, p = 0;

      const drawNextPoint = () => {
         const stroke = strokes[s];
         ctx.strokeStyle = stroke.strokeColor || "#000000";
         ctx.lineWidth = stroke.strokeWidth || 3;
         const pt = stroke.paths[p];

         if (p === 0) {
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
         } else {
            ctx.lineTo(pt.x, pt.y);
         }
         ctx.stroke();

         p++;
         if (p >= stroke.paths.length) { s++; p = 0; }
         if (s < strokes.length) setTimeout(drawNextPoint, 8);
         else {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth;
         }
      };
      setTimeout(drawNextPoint, 0);
   }

   const startDrawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (!isHost) return
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
      if (!isHost) return
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
      if (!isHost) return
      e.preventDefault() // Prevent scrolling
      if (!drawing.current) return
      drawing.current = false

      // Send complete stroke to backend
      const completedStroke: Stroke = {
         strokeColor,
         strokeWidth,
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
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-900/60 p-4">
         {/* Paint window */}
         <div className="flex w-full max-w-5xl gap-4">
            <div className="flex-1">
               {/* Title bar */}
               <div className="flex items-center justify-between rounded-t-md bg-gradient-to-b from-[#0b65ad] to-[#0a4f84] px-3 py-1 text-sm font-semibold text-white shadow">
                  <span>Doodlz - {roomId}</span>
                  <div className="flex gap-1">
                     <span className="h-3 w-3 rounded-sm bg-yellow-300" />
                     <span className="h-3 w-3 rounded-sm bg-green-400" />
                     <span className="h-3 w-3 rounded-sm bg-red-400" />
                  </div>
               </div>

               {/* Content frame */}
               <div className="rounded-b-md border border-[#0a4f84] bg-slate-100 shadow-[0_0_0_1px_rgba(0,0,0,0.3)]">
                  {/* Toolbar row */}
                  <div className="flex flex-wrap items-center gap-3 border-b bg-slate-200 px-3 py-2">
                     <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-slate-700">Width</label>
                        <input
                           type="range"
                           min={1}
                           max={12}
                           value={strokeWidth}
                           onChange={e => setStrokeWidth(Number(e.target.value))}
                           className="h-2 cursor-pointer"
                        />
                        <span className="w-6 text-center text-xs">{strokeWidth}</span>
                     </div>
                     {isHost && (
                        <div className="flex items-center gap-2">
                           <button
                              onClick={() => clearAll(canvasRef, ctxRef, setAllStrokes, socketRef)}
                              className="rounded border border-slate-400 bg-white px-2 py-1 text-xs hover:bg-red-500 hover:text-white"
                           >
                              Clear
                           </button>
                           <button
                              onClick={undoLast}
                              className="rounded border border-slate-400 bg-white px-2 py-1 text-xs hover:bg-slate-500 hover:text-white"
                           >
                              Undo
                           </button>
                        </div>
                     )}
                     <div className="ml-auto text-xs text-slate-600">
                        Users: {connectedUsers.length} {isHost ? "(Host)" : ""}
                     </div>
                  </div>

                  {/* Drawing area */}
                  <div className="flex flex-col items-stretch gap-2 p-3">
                     <div className="relative rounded border border-slate-400 bg-white shadow-inner">
                        <canvas
                           ref={canvasRef}
                           className="block h-[420px] w-full"
                           onMouseDown={startDraw}
                           onMouseMove={draw}
                           onMouseUp={endDraw}
                           onMouseLeave={endDraw}
                           onTouchStart={startDrawTouch}
                           onTouchMove={drawTouch}
                           onTouchEnd={endDrawTouch}
                           onTouchCancel={endDrawTouch}
                           style={{ touchAction: "none", backgroundColor: "#ffffff" }}
                        />
                     </div>

                     {/* Color palette */}
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Colors</span>
                        <div className="grid grid-cols-9 gap-1">
                           {PALETTE.map(c => {
                              const active = c === strokeColor;
                              return (
                                 <button
                                    key={c}
                                    onClick={() => setStrokeColor(c)}
                                    className={`h-6 w-6 rounded-sm border ${active ? "border-black ring-2 ring-offset-1 ring-sky-500" : "border-slate-400"}`}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                 />
                              );
                           })}
                           {/* custom color swatch (placeholder) */}
                           <button
                              onClick={() => {
                                 const v = prompt("Custom hex color:", strokeColor) || strokeColor;
                                 setStrokeColor(v);
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-sm border border-slate-400 bg-gradient-to-br from-slate-200 to-slate-300 text-[10px] font-medium"
                           >
                              +
                           </button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Chat side panel */}
            <div className="flex w-72 flex-col rounded-md border border-[#0a4f84] bg-slate-100 shadow">
               <div className="rounded-t-md bg-gradient-to-b from-[#0b65ad] to-[#0a4f84] px-3 py-1 text-sm font-semibold text-white">
                  Chat
               </div>
               <div id="messages" className="flex-1 overflow-y-auto p-2 text-xs">
                  {/* messages go here */}
               </div>
               <div className="border-t p-2">
                  <Input placeholder="Type message..." className="h-8 text-xs" />
               </div>
            </div>
         </div>
      </div>
   );
}

export default Game