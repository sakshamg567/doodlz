import { cn } from "@/lib/utils";
import type { Player } from "@/types/types";

export const PlayerTab = ({
   connectedUsers,
   guessedNames,
   className = ""
}: {
   connectedUsers: Player[],
   guessedNames: Set<any>
   className?: string
}) => {
   return (
      <div className={cn("flex w-48 flex-col border bg-white shadow", className)}>
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
   )
}