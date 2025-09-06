import type { Player, UiMessage } from "@/types/types"
import { MobileToolBar } from "./ToolBar";
import { PlayerTab } from "./PlayerTab";
import { Chat, ChatInput } from "./Chat";

export const MobileLayout = ({
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
}: {
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
}) => {


   return (
      <div className="flex flex-col min-h-screen max-h-screen z-100 gap-1 w-full">
         <div id="header" className="flex flex-row place-content-around bg-white min-h-14 flex-shrink-0">
            <div>CLOCK</div>
            <div>PLACEHOLDER</div>
            <div>SETTINGS</div>
         </div>
         <div className="flex-shrink-0 overflow-hidden">
            <canvas
               ref={canvasRef}
               className="w-full "
               style={{
                  aspectRatio: 4 / 3,
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
         <MobileToolBar
            strokeWidth={strokeWidth}
            strokeColor={strokeColor}
            setStrokeColor={setStrokeColor}
            setStrokeWidth={setStrokeWidth}
            clearAll={clearAll}
            undoLast={undoLast}
         />
         <div className="flex flex-row flex-1 min-h-20 gap-1">
            <PlayerTab
               className="w-1/2 h-fit"
               connectedUsers={connectedUsers}
               guessedNames={guessedNames}
            />
            <Chat
               className="w-1/2 flex-1"
               listRef={listRef}
               messages={messages}
            />
         </div>
         <ChatInput
            className="h-10"
            input={input}
            setInput={setInput}
            submitChatMsg={submitChatMsg}
         />
      </div>
   )
}

