import type { UiMessage } from "@/types/types";
import React from "react";

export const Chat = ({ input, setInput, listRef, messages, submit }: { input: string, setInput: React.Dispatch<React.SetStateAction<string>>, listRef: React.RefObject<null>, messages: UiMessage[], submit: (msg: string) => void }) => {

   return (
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
                  submit(input);
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
                        submit(input);
                        e.stopPropagation();
                     }
                  }}
               />
            </form>
         </div>
      </div>
   )
}