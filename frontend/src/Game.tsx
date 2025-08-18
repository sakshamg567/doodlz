import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { type WSMessage, type Stroke, type Point, type Player, type UiMessage } from "./types/types"
import { sendPoint, drawPoint, clearAll, clearCanvas, pointerPos } from "./core"
import { getOrCreateGuestId } from "./core/lib/guesId"
import { PALETTE } from "./core/constants";
import normalizeInbound from "./core/lib/normalizeUiMsg";

const Game = ({ roomId }: { roomId: string }) => {
   const canvasRef = useRef<HTMLCanvasElement | null>(null)
   const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
   const socketRef = useRef<WebSocket | null>(null)
   const drawingRef = useRef(false)
   const listRef = useRef(null);

   const [connectedUsers, setConnectedUsers] = useState<Player[] | []>([])
   const [allStrokes, setAllStrokes] = useState<Stroke[]>([])
   const [currentStroke, setCurrentStroke] = useState<Point[]>([])
   const [messages, setMessages] = useState<UiMessage[]>([]);
   const [input, setInput] = useState("")
   const [points, setPoints] = useState(0);

   const [isHost, setIsHost] = useState<boolean>(false)

   const [strokeColor, setStrokeColor] = useState("#000000");
   const [strokeWidth, setStrokeWidth] = useState(3);
   // Track players who have guessed correctly this round (by name)
   const guessedNames = useMemo(
      () => new Set(
         messages
            .filter(m => m.type === 'correct_guess')
            .map(m => (m as any).playerName)
      ),
      [messages]
   );


   const id = getOrCreateGuestId();

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
      socketRef.current.onmessage = handleSocketMessage

      return () => socketRef.current?.close()
   }, [roomId])

   // If user changes color / width, just update context for next stroke
   useEffect(() => {
      if (ctxRef.current) {
         ctxRef.current.strokeStyle = strokeColor;
         ctxRef.current.lineWidth = strokeWidth;
      }
   }, [strokeColor, strokeWidth]);


   useEffect(() => {
      const el = listRef.current as unknown as HTMLDivElement | null;
      if (el) el.scrollTop = el.scrollHeight;
   }, [messages]);

   const handleSocketMessage = (event: MessageEvent) => {
      const raw: WSMessage = JSON.parse(event.data);
      console.log(raw);

      switch (raw.type) {
         case 'draw_point':
            drawPoint(ctxRef, raw.data);
            return;
         case 'stroke':
            setAllStrokes(prev => [...prev, raw.data as Stroke]);
            return;
         case 'clear':
            clearCanvas(canvasRef, ctxRef);
            setAllStrokes([]);
            return;
         case 'undo':
            setAllStrokes(prev => {
               if (!prev.length) return prev;
               const upd = prev.slice(0, -1);
               replayAllStrokes(upd);
               return upd;
            });
            return;
         case 'user_joined':
            setConnectedUsers(Object.values(raw.data) as Player[]);
            return;
         case 'user_left':
            setConnectedUsers(prev => prev.filter(u => u.ID !== raw.data.userId));
            return;
         case 'game_state':
            replayAllStrokesWithDelay(raw.data.strokes || []);
            setAllStrokes(raw.data.strokes || []);
            if (raw.data.hostId) setIsHost(raw.data.hostId === id);
            return;
         default: {
            const ui = normalizeInbound(raw);
            if (ui) setMessages(prev => [...prev, ui]);
         }
      }
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

   const handlePointerDown = (e: React.PointerEvent) => {
      if (!isHost) return;
      e.preventDefault();
      const ctx = ctxRef.current;
      if (!ctx) return;

      canvasRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      setCurrentStroke([]);
      const { x, y } = pointerPos(e, canvasRef);
      ctx.beginPath();
      ctx.moveTo(x, y);
      const startPoint: Point = { x, y, type: "start", pointColor: strokeColor, pointSize: strokeWidth };
      setCurrentStroke(prev => [...prev, startPoint]);
      sendPoint(socketRef, startPoint);
   };

   const handlePointerMove = (e: React.PointerEvent) => {
      if (!drawingRef.current || !isHost) return;
      e.preventDefault();
      const ctx = ctxRef.current;
      if (!ctx) return;
      const { x, y } = pointerPos(e, canvasRef);
      ctx.lineTo(x, y);
      ctx.stroke();
      const movePoint: Point = { x, y, type: "move", pointColor: strokeColor, pointSize: strokeWidth };
      setCurrentStroke(prev => [...prev, movePoint]);
      sendPoint(socketRef, movePoint);
   };

   const finishStroke = useCallback(() => {
      if (!drawingRef.current) return;
      drawingRef.current = false;

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
      setAllStrokes(prev => [...prev, completedStroke])
      setCurrentStroke([]);
      const endPoint: Point = { x: 0, y: 0, type: "end", pointColor: strokeColor, pointSize: strokeWidth };
      sendPoint(socketRef, endPoint);
   }, [strokeColor, strokeWidth, setCurrentStroke, currentStroke])

   const handlePointerUp = (e: React.PointerEvent) => {
      if (!isHost) return;
      e.preventDefault();
      finishStroke();
   };
   const handlePointerLeave = (e: React.PointerEvent) => {
      if (!isHost) return;
      if (drawingRef.current) finishStroke();
   }

   // submitChatMsg: just send guess text (server fills sender)
   const submitChatMsg = (msg: string) => {
      const text = msg.trim();
      if (!socketRef.current || !text) return;
      socketRef.current.send(JSON.stringify({
         type: 'guess',
         data: { guess: text }
      }));
      setInput('');
   };

   const undoLast = () => {
      if (!isHost) return
      // undo handled in backend, just send an undo request
      const msg: WSMessage = { type: "undo", data: {} }
      socketRef.current?.send(JSON.stringify(msg))
   }



   return (
      <div className="relative h-screen min-h-screen bg-[url('/bg.webp')] bg-no-repeat bg-center bg-cover flex flex-col items-center justify-center">
         {/* Doodle PNG Overlay */}
         <div className="absolute opacity-25 inset-0 bg-[url('/doodlez.webp')] bg-no-repeat bg-center bg-cover pointer-events-none" />


         <div className="flex w-full max-w-5xl z-10 gap-1">
            {/* Players panel */}
            <div className="flex w-48 flex-col border bg-slate-100 shadow">
               <div className="bg-gradient-to-b from-[#0b65ad] to-[#0a4f84] px-2 py-1 text-xs font-semibold text-white">
                  Players ({connectedUsers.length})
               </div>
               <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {connectedUsers.map(u => {
                     const guessed = guessedNames.has(u.Name);
                     return (
                        <div
                           key={u.ID}
                           className={`flex items-center justify-between rounded px-2 py-1 text-xs border transition-colors
                              ${guessed
                                 ? 'bg-green-100 border-green-400 text-green-700 font-semibold'
                                 : 'bg-white border-slate-300'
                              }`}
                           title={guessed ? 'Guessed correctly' : 'Has not guessed yet'}
                        >
                           <span className="truncate">{u.Name}</span>
                        </div>
                     );
                  })}
                  {!connectedUsers.length && (
                     <div className="text-[10px] italic text-slate-500">No players</div>
                  )}
               </div>
            </div>
            <div className="flex-1">
               {/* Title bar */}
               <div className="flex items-center justify-between bg-gradient-to-b from-[#0b65ad] to-[#0a4f84] px-3 py-1 text-sm font-semibold text-white shadow">
                  <span>Doodlz - {roomId}</span>
               </div>

               {/* Content frame */}
               <div className="border border-[#0a4f84] bg-slate-100 shadow-[0_0_0_1px_rgba(0,0,0,0.3)]">
                  {/* Player info */}



                  {/* Toolbar row */}
                  <div className="flex flex-wrap items-center gap-3 border-b bg-slate-200 px-3 py-2">
                     {isHost && <div className="flex items-center gap-2">
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
                     </div>}
                     {isHost && (
                        <div className="flex items-center gap-2">
                           <button
                              onClick={() => clearAll(canvasRef, ctxRef, setAllStrokes, socketRef)}
                              className="border border-slate-400 bg-white px-2 py-1 text-xs hover:bg-red-500 hover:text-white"
                           >
                              Clear
                           </button>
                           <button
                              onClick={() => {
                                 undoLast({ isHost, socketRef })
                              }}
                              className="border border-slate-400 bg-white px-2 py-1 text-xs hover:bg-slate-500 hover:text-white"
                           >
                              Undo
                           </button>
                        </div>
                     )}
                     <div className="ml-auto text-xs text-slate-600">
                        Users: {connectedUsers.length}
                     </div>
                  </div>

                  {/* drawing area */}
                  <div className="flex flex-col items-stretch gap-2 p-3">
                     <div className="relative border border-slate-400 bg-white shadow-inner">
                        <canvas
                           ref={canvasRef}
                           className="block h-[420px] w-full"
                           onPointerCancel={handlePointerLeave}
                           onPointerLeave={handlePointerLeave}
                           onPointerDown={handlePointerDown}
                           onPointerMove={handlePointerMove}
                           onPointerUp={handlePointerUp}
                           style={{ touchAction: "none", backgroundColor: "#ffffff" }}
                        />
                     </div>

                     {/* Color palette */}
                     {isHost &&
                        <div className="flex flex-col gap-1">
                           <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Colors</span>
                           <div className="grid grid-cols-9 gap-1">
                              {PALETTE.map(c => {
                                 const active = c === strokeColor;
                                 return (
                                    <button
                                       key={c}
                                       onClick={() => setStrokeColor(c)}
                                       className={`h-6 w-6 border ${active ? "border-black ring-2 ring-offset-1 ring-sky-500" : "border-slate-400"}`}
                                       style={{ backgroundColor: c }}
                                       title={c}
                                    />
                                 );
                              })}
                           </div>
                        </div>}
                  </div>
               </div>
            </div>

            {/* Chat side panel */}
            <div className={`flex w-72 flex-col border bg-slate-100 shadow`}>
               <div
                  ref={listRef}
                  className="flex-1 overflow-y-auto p-2 text-xs space-y-1"
               >
                  {messages.map((m, i) => {
                     switch (m.type) {
                        case 'chat_msg':
                           return (
                              <div key={i} className={`${i % 2 ? 'bg-gray-200' : ''} p-1`}>
                                 <span className="font-semibold">{m.sender.Name}:</span>{" "}
                                 <span className="break-words">
                                    {m.message}
                                 </span>
                              </div>
                           );
                        case 'correct_guess':
                           return (
                              <div key={i} className={`p-1 text-green-600 font-semibold ${i % 2 ? 'bg-gray-200' : ''}`}>
                                 {m.playerName} guessed the word!
                              </div>
                           );
                        case 'close_guess':
                           return (
                              <div key={i} className={`p-1 ${m.editDistance > 0 ? 'text-lime-400' : 'text-black'} ${i % 2 ? 'bg-gray-200' : ''} `}>
                                 <span className="font-semibold">{m.playerName}:</span>{" "}
                                 <span className="break-words">
                                    {m.message}
                                 </span>
                              </div>
                           );
                     }
                  })}
               </div>
               <div className="border-t p-2">
                  <form
                     onSubmit={e => {
                        e.preventDefault()
                        submitChatMsg(input);
                     }}
                     className="flex gap-1"
                  >
                     <input
                        placeholder="Type message..."
                        className="h-8 text-xs flex-1 p-1"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                           if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              submitChatMsg(input);
                              e.stopPropagation();
                           }
                        }}
                     />
                  </form>
               </div>
            </div>
         </div>
      </div>
   );
}

export default Game