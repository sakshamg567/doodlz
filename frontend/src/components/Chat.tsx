import { cn } from "@/lib/utils"
import type { UiMessage } from "@/types/types"

export const ChatInput = ({
   input,
   setInput,
   submitChatMsg,
   className = ""
}: {
   input: string,
   setInput: React.Dispatch<React.SetStateAction<string>>
   submitChatMsg: (val: string) => void
   className?: string
}) => {
   return (
      <div className={cn("p-2 bg-white", className)}>
         <form
            onSubmit={e => {
               e.preventDefault()
               submitChatMsg(input);
            }}
            className="flex gap-1"
         >
            <input
               placeholder="Type message..."
               className="h-8 text-xs flex-1 p-1 text-center"
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

   )
}

export const Chat = ({
   listRef,
   messages,
   className = ""
}: {
   listRef: React.RefObject<HTMLDivElement | null>
   messages: UiMessage[],
   className?: string
}) => {
   return (
      <div className={cn(`flex w-72 flex-col border bg-white shadow`, className)}>
         <div
            ref={listRef}
            className="flex-1 overflow-y-auto text-xs space-y-1"
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
      </div>
   )
}