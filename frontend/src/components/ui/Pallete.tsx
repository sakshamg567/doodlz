import { PALETTE } from "@/core/constants";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";

export const Palette = ({ setStrokeColor, className = "" }: { setStrokeColor: React.Dispatch<React.SetStateAction<string>>, className?: string }) => {

   const isMobile = useIsMobile()

   return (
      <div className={cn("flex flex-col", className)}>
         <div className="grid grid-cols-13">
            {PALETTE.map(c => {
               return (
                  <button
                     key={c}
                     onClick={() => setStrokeColor(c)}
                     className={`${isMobile ? "aspect-square" : "w-6 h-6"}`}
                     style={{ backgroundColor: c }}
                     title={c}
                  />
               );
            })}
         </div>
      </div>
   )
}