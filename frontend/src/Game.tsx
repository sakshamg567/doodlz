import React, { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { type WSMessage, type Stroke, type Point, type Player, type UiMessage } from "./types/types"
import { sendPoint, drawPoint, pointerPos } from "./core"
import { getOrCreateGuestId } from "./core/lib/guesId"
import normalizeInbound from "./core/lib/normalizeUiMsg";
import { useIsMobile } from "./hooks/useIsMobile";
import { MobileLayout } from "./components/MobileLayout";
import { NormalLayout } from "./components/NormalLayout";

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
   // const [points, setPoints] = useState(0);

   const [isHost, setIsHost] = useState<boolean>(false)
   const isMobile = useIsMobile()

   const [strokeColor, setStrokeColor] = useState("#000000");
   const [strokeWidth, setStrokeWidth] = useState(6);
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


   const clearCanvas = () => {
      const canvas = canvasRef.current
      if (!canvas || !ctxRef.current) return
      ctxRef.current.clearRect(0, 0, canvas.width, canvas.height)
   }

   const clearAll = () => {
      clearCanvas()
      setAllStrokes([])

      // Send clear message to other users
      const msg: WSMessage = { type: "clear", data: {} }
      socketRef.current?.send(JSON.stringify(msg))
   }



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
            clearCanvas();
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
      clearCanvas()
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
      clearCanvas()

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

         {isMobile ?
            <MobileLayout
               canvasRef={canvasRef}
               handlePointerDown={handlePointerDown}
               handlePointerLeave={handlePointerLeave}
               handlePointerMove={handlePointerMove}
               handlePointerUp={handlePointerUp}
               input={input}
               setInput={setInput}
               submitChatMsg={submitChatMsg}
               listRef={listRef}
               messages={messages}
               connectedUsers={connectedUsers}
               guessedNames={guessedNames}
               strokeColor={strokeColor}
               strokeWidth={strokeWidth}
               setStrokeColor={setStrokeColor}
               setStrokeWidth={setStrokeWidth}
               undoLast={undoLast}
               clearAll={clearAll}
            />
            : (
               <NormalLayout
                  canvasRef={canvasRef}
                  handlePointerDown={handlePointerDown}
                  handlePointerLeave={handlePointerLeave}
                  handlePointerMove={handlePointerMove}
                  handlePointerUp={handlePointerUp}
                  input={input}
                  setInput={setInput}
                  submitChatMsg={submitChatMsg}
                  listRef={listRef}
                  messages={messages}
                  connectedUsers={connectedUsers}
                  guessedNames={guessedNames}
                  strokeColor={strokeColor}
                  strokeWidth={strokeWidth}
                  setStrokeColor={setStrokeColor}
                  setStrokeWidth={setStrokeWidth}
                  undoLast={undoLast}
                  clearAll={clearAll}
               />
            )}
      </div>
   );
}

export default Game