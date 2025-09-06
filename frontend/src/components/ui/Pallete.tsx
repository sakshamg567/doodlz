import { PALETTE } from "@/core/constants";

export const Palette = ({ strokeColor, setStrokeColor }: { strokeColor: string, setStrokeColor: React.Dispatch<React.SetStateAction<string>> }) => {
   return (
      <div className="flex flex-col">
         <div className="grid grid-cols-13">
            {PALETTE.map(c => {
               const active = c === strokeColor;
               return (
                  <button
                     key={c}
                     onClick={() => setStrokeColor(c)}
                     className={`aspect-square`}
                     style={{ backgroundColor: c }}
                     title={c}
                  />
               );
            })}
         </div>
      </div>
   )
}