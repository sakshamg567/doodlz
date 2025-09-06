import type { Player, UiMessage } from "@/types/types"
import { Chat, ChatInput } from "./Chat"
import { Header } from "./Header"
import { PlayerTab } from "./PlayerTab"
import { NormalToolbar } from "./ToolBar"

interface NormalLayoutProps {
   canvasRef: React.RefObject<HTMLCanvasElement | null>,
   handlePointerLeave: (e: React.PointerEvent) => void,
   handlePointerDown: (e: React.PointerEvent) => void,
   handlePointerMove: (e: React.PointerEvent) => void,
   handlePointerUp: (e: React.PointerEvent) => void,
   input: string,
   setInput: React.Dispatch<React.SetStateAction<string>>,
   submitChatMsg: (val: string) => void,
   listRef: React.RefObject<HTMLDivElement | null>,
   messages: UiMessage[],
   connectedUsers: Player[],
   guessedNames: Set<any>,
   clearAll: () => void,
   undoLast: () => void,
   strokeWidth: number,
   setStrokeWidth: React.Dispatch<React.SetStateAction<number>>,
   strokeColor: string,
   setStrokeColor: React.Dispatch<React.SetStateAction<string>>
}

export const NormalLayout = ({
   canvasRef,
   handlePointerLeave,
   handlePointerDown,
   handlePointerMove,
   handlePointerUp,
   input,
   setInput,
   submitChatMsg,
   listRef,
   messages,
   connectedUsers,
   guessedNames,
   clearAll,
   undoLast,
   strokeWidth,
   setStrokeWidth,
   strokeColor,
   setStrokeColor,
}: NormalLayoutProps) => {
   return (
      <div className="flex flex-col h-screen w-screen z-100 mt-20 p-2 gap-1">
         <Header />
         <div id="main" className="flex flex-1 gap-1">
            <PlayerTab
               className="w-52 shrink-0 h-fit overflow-y-auto"
               connectedUsers={connectedUsers}
               guessedNames={guessedNames}
            />
            <div className="flex flex-col flex-1 min-w-0 gap-1">
               <div className="flex-1 min-h-0 flex flex-col">
                  <div className="relative flex-1 min-h-0">
                     <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full rounded border shadow"
                        style={{
                           aspectRatio: 3 / 4,
                           touchAction: "none",
                           backgroundColor: "#ffffff"
                        }}
                        onPointerCancel={handlePointerLeave}
                        onPointerLeave={handlePointerLeave}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                     />
                  </div>
                  <div className="w-full">
                     <NormalToolbar
                        setStrokeColor={setStrokeColor}
                        setStrokeWidth={setStrokeWidth}
                        strokeColor={strokeColor}
                        strokeWidth={strokeWidth}
                        undoLast={undoLast}
                        clearAll={clearAll}
                     />
                  </div>
               </div>
            </div>
            <div className="flex flex-col w-80 shrink-0 h-full border-l bg-white">
               <Chat
                  className="flex-1 overflow-y-auto w-full"
                  listRef={listRef}
                  messages={messages}
               />
               <div className="p-1">
                  <ChatInput
                     className="w-full border border-black"
                     input={input}
                     setInput={setInput}
                     submitChatMsg={submitChatMsg}
                  />
               </div>
            </div>
         </div>
      </div>

   )
}