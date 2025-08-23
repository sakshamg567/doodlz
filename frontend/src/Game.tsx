import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { type WSMessage, type Stroke, type Point, type Player, type UiMessage } from "./types/types"
import { sendPoint, drawPoint, clearAll, clearCanvas, pointerPos } from "./core"
import { getOrCreateGuestId } from "./core/lib/guesId"
import { PALETTE } from "./core/constants";
import normalizeInbound from "./core/lib/normalizeUiMsg";
import { Chat } from "./components/Chat";
import hexToUint32 from "./core/lib/hexToUint32";

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
   // const [currWord, setCurrWord] = useState("")

   const [isHost, setIsHost] = useState<boolean>(false)

   const [strokeColor, setStrokeColor] = useState("#000000");
   const [strokeWidth, setStrokeWidth] = useState(6);

   // NEW: brush states
   const BRUSH_SIZES = [6, 10, 16, 20];
   const [tool, setTool] = useState<'brush' | 'bucket'>('brush');
   const [brushMenuOpen, setBrushMenuOpen] = useState(false);
   const brushMenuRef = useRef<HTMLDivElement | null>(null);

   // Brush preview (custom cursor)
   const [showBrushPreview, setShowBrushPreview] = useState(false);
   const [brushPos, setBrushPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

   // Track players who have guessed correctly this round

   const guessedNames = useMemo(
      () => new Set(
         messages
            .filter(m => m.type === 'correct_guess')
            .map(m => (m as any).playerId)
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

   // Close brush menu on outside click
   useEffect(() => {
      const handler = (e: MouseEvent) => {
         if (!brushMenuRef.current) return;
         if (!brushMenuRef.current.contains(e.target as Node)) {
            setBrushMenuOpen(false);
         }
      };
      if (brushMenuOpen) document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
   }, [brushMenuOpen]);

   useEffect(() => {
      const el = listRef.current as unknown as HTMLDivElement | null;
      if (el) el.scrollTop = el.scrollHeight;
   }, [messages]);

   function floodFill(x: number, y: number, fillHex: string, broadcast = true) {
      const ctx = ctxRef.current
      const canvas = canvasRef.current
      if (!ctx || !canvas) return

      x = Math.floor(Math.max(0, Math.min(canvas.width - 1, x)));
      y = Math.floor(Math.max(0, Math.min(canvas.height - 1, y)));

      const w = canvas.width
      const h = canvas.height
      const image = ctx.getImageData(0, 0, w, h)
      const data32 = new Uint32Array(image.data.buffer)

      const startIdx = y * w + x
      const targetColor = data32[startIdx]
      const fillColor = hexToUint32(fillHex)

      if (targetColor == fillColor) {
         if (broadcast && socketRef.current) {
            socketRef.current.send(JSON.stringify({ type: "fill", data: { x, y, color: fillHex, noop: true } }))
         }
         return;
      }

      const stack: number[] = [startIdx]
      while (stack.length) {
         const idx = stack.pop()!
         if (data32[idx] !== targetColor) continue

         let left = idx
         let right = idx
         const rowStart = Math.trunc(idx / w) * w
         while (left >= rowStart && data32[left] === targetColor) left--;
         while (right < rowStart + w && data32[right] === targetColor) right++

         let pushedUp = false;
         let pushedDown = false;
         for (let i = left + 1; i < right; i++) {
            data32[i] = fillColor;
            const up = i - w;
            const down = i + w;
            if (!pushedUp && up >= 0 && data32[up] === targetColor) {
               stack.push(up);
               pushedUp = true;
            } else if (pushedUp && up >= 0 && data32[up] !== targetColor) {
               pushedUp = false;
            }
            if (!pushedDown && down < w * h && data32[down] === targetColor) {
               stack.push(down);
               pushedDown = true;
            } else if (pushedDown && down < w * h && data32[down] !== targetColor) {
               pushedDown = false;
            }
         }
      }
      ctx.putImageData(image, 0, 0);
      if (broadcast && socketRef.current) {
         socketRef.current.send(JSON.stringify({
            type: "fill",
            data: { x, y, color: fillHex }
         }));
      }
   }

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
            console.log(connectedUsers);

            return;
         case 'user_left':
            setConnectedUsers(prev => prev.filter(u => u.playerId !== raw.data.userId));
            return;
         case 'game_state':
            replayAllStrokesWithDelay(raw.data.strokes || []);
            setAllStrokes(raw.data.strokes || []);
            if (raw.data.hostId) setIsHost(raw.data.hostId === id);
            return;

         case 'fill':
            floodFill(raw.data.x, raw.data.y, raw.data.color, false)
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
         if (s < strokes.length) setTimeout(drawNextPoint, 16);
         else {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth;
         }
      };
      setTimeout(drawNextPoint, 0);
   }

   const handlePointerDown = (e: React.PointerEvent) => {
      if (!isHost) return;
      const { x, y } = pointerPos(e, canvasRef);
      if (tool === "bucket") {
         e.preventDefault();
         floodFill(x, y, strokeColor, true);
         return;
      }
      e.preventDefault()
      setShowBrushPreview(true);
      const ctx = ctxRef.current;
      if (!ctx) return;

      canvasRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      setCurrentStroke([]);
      setBrushPos({ x, y });
      ctx.beginPath();
      ctx.moveTo(x, y);
      const startPoint: Point = { x, y, type: "start", pointColor: strokeColor, pointSize: strokeWidth };
      setCurrentStroke(prev => [...prev, startPoint]);
      sendPoint(socketRef, startPoint);
   };

   const handlePointerMove = (e: React.PointerEvent) => {
      if (!isHost) return;
      e.preventDefault();
      const { x, y } = pointerPos(e, canvasRef);
      setBrushPos({ x, y });

      if (!drawingRef.current) return;

      const ctx = ctxRef.current;
      if (!ctx) return;
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
      setShowBrushPreview(false);
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
                     const guessed = guessedNames.has(u.playerId);
                     return (
                        <div
                           key={u.playerId}
                           className={`flex items-center justify-between rounded px-2 py-1 text-xs border transition-colors
                              ${guessed
                                 ? 'bg-green-100 border-green-400 text-green-700 font-semibold'
                                 : 'bg-white border-slate-300'
                              }`}
                           title={guessed ? 'Guessed correctly' : 'Has not guessed yet'}
                        >
                           <span className="truncate">{u.playerId}</span>
                        </div>
                     );
                  })}
                  {!connectedUsers.length && (
                     <div className="text-[10px] italic text-slate-500">No players</div>
                  )}
               </div>
            </div>
            <div className="flex-1">

               {/* Player info */}



               {/* drawing area */}
               <div className="flex flex-col items-stretch gap-2 p-3">
                  <div className="relative border border-slate-400 bg-white shadow-inner">
                     {/* Canvas wrapper now relative for brush preview */}
                     <canvas
                        ref={canvasRef}
                        className="block h-[420px] w-full"
                        onPointerCancel={handlePointerLeave}
                        onPointerLeave={handlePointerLeave}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerEnter={() => isHost && tool === 'brush' && setShowBrushPreview(true)}
                        style={{
                           touchAction: "none",
                           backgroundColor: "#ffffff",
                           cursor: isHost ? "none" : "default"
                        }}
                     />
                     {/* Custom brush cursor */}
                     {isHost && tool === "brush" && showBrushPreview && (
                        <div
                           className="pointer-events-none absolute"
                           style={{
                              left: brushPos.x,
                              top: brushPos.y,
                              width: strokeWidth,
                              height: strokeWidth,
                              backgroundColor: strokeColor,
                              borderRadius: "50%",
                              transform: "translate(-50%, -50%)",
                              boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
                              opacity: 0.9,
                              mixBlendMode: "multiply"
                           }}
                        />
                     )}
                  </div>
                  <div>
                     <button
                        onClick={() => {
                           navigator.clipboard.writeText(`${window.location.href}?roomId=${roomId}`)
                        }}
                     >Copy Join URL</button>
                  </div>

                  {/* Toolbar area */}

                  {isHost && <div className="flex flex-wrap items-center gap-3 border-b bg-slate-200 px-3 py-2">
                     <div className="flex items-center gap-1">
                        <button
                           onClick={() => setTool('brush')}
                           className={`px-2 py-1 text-xs border rounded ${tool === 'brush' ? 'bg-sky-500 text-white border-sky-600' : 'bg-white border-slate-400 hover:bg-slate-100'}`}
                           title="Brush tool (B)"
                        >Brush</button>
                        <button
                           onClick={() => setTool('bucket')}
                           className={`px-2 py-1 text-xs border rounded ${tool === 'bucket' ? 'bg-sky-500 text-white border-sky-600' : 'bg-white border-slate-400 hover:bg-slate-100'}`}
                           title="Bucket fill (F)"
                        >Fill</button>
                     </div>

                     {/* Color palette */}
                     <div className="flex flex-col gap-1">
                        <div className="w-50 grid grid-cols-9">
                           {PALETTE.map(c => {
                              const active = c === strokeColor;
                              return (
                                 <button
                                    key={c}
                                    onClick={() => setStrokeColor(c)}
                                    className={`h-6 w-6`}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                 />
                              );
                           })}
                        </div>
                     </div>

                     {/* Brush size picker (replaces range slider) */}
                     <div
                        className="relative"
                        ref={brushMenuRef}
                     >
                        <button
                           type="button"
                           onClick={() => setBrushMenuOpen(o => !o)}
                           className="flex items-center justify-center border border-slate-400 bg-white rounded-full hover:ring-2 hover:ring-sky-400 transition"
                           style={{
                              width: Math.max(strokeWidth + 12, 28),
                              height: Math.max(strokeWidth + 12, 28),
                              position: "relative"
                           }}
                           title="Brush size"
                        >
                           <span
                              style={{
                                 width: strokeWidth,
                                 height: strokeWidth,
                                 backgroundColor: strokeColor,
                                 borderRadius: "50%",
                                 display: "block"
                              }}
                           />
                        </button>

                        {brushMenuOpen && (
                           <div className="absolute left-1/2 -translate-x-1/2 mt-2 flex flex-col gap-2 rounded-md border border-slate-300 bg-white p-3 shadow z-20">
                              {BRUSH_SIZES.map(sz => {
                                 const active = sz === strokeWidth;
                                 return (
                                    <button
                                       key={sz}
                                       onClick={() => {
                                          setStrokeWidth(sz);
                                          setBrushMenuOpen(false);
                                       }}
                                       className={`flex items-center justify-center rounded-full transition ${active
                                          ? "ring-2 ring-sky-500"
                                          : "hover:bg-slate-100"
                                          }`}
                                       style={{
                                          width: 34,
                                          height: 34
                                       }}
                                       title={`${sz}px`}
                                    >
                                       <span
                                          style={{
                                             width: sz,
                                             height: sz,
                                             backgroundColor: strokeColor,
                                             borderRadius: "50%",
                                             display: "block",
                                             boxShadow: "0 0 0 1px rgba(0,0,0,0.3)"
                                          }}
                                       />
                                    </button>
                                 );
                              })}
                           </div>
                        )}
                     </div>

                     <div className="flex items-center gap-2">
                        <button
                           onClick={() => clearAll(canvasRef, ctxRef, setAllStrokes, socketRef)}
                           className="w-10 h-10 border border-slate-400 bg-white px-2 py-1 text-xs hover:bg-red-500 hover:text-white rounded"
                           title="Clear canvas"
                        >
                           <img className="w-9" src="/trashcan.png" alt="Clear" />
                        </button>
                        <button
                           onClick={undoLast}
                           className="w-10 h-10 border  border-slate-400 bg-white px-2 py-1 text-xs hover:bg-slate-500 hover:text-white rounded"
                           title="Undo last stroke"
                        >
                           <img className="w-9" src="/undo.png" alt="Undo" />
                        </button>
                     </div>
                  </div>
                  }
               </div>
            </div>
         </div>

         {/* Chat side panel */}
         <Chat
            input={input}
            setInput={setInput}
            listRef={listRef}
            messages={messages}
            submit={submitChatMsg}
         />
      </div>
   );
}

export default Game