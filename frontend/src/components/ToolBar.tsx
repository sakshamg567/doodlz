import { Palette } from "./ui/Pallete"
import React, { useEffect, useRef, useState } from "react"
// import rough from "roughjs"
export const MobileToolBar = ({
   strokeWidth,
   setStrokeWidth,
   strokeColor,
   setStrokeColor,
   clearAll,
   undoLast,
}
   : {
      strokeWidth: number,
      setStrokeWidth: React.Dispatch<React.SetStateAction<number>>,
      strokeColor: string,
      setStrokeColor: React.Dispatch<React.SetStateAction<string>>,
      clearAll: () => void,
      undoLast: () => void
   }) => {
   return (
      <div className="flex flex-row place-content-around">
         <MobileColorPreview
            strokeColor={strokeColor}
            setStrokeColor={setStrokeColor}
         />
         <StrokeSelector
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
         />
         <UndoClear
            clearAll={clearAll}
            undoLast={undoLast}
         />
      </div>
   )
}

const UndoClear = ({
   clearAll,
   undoLast
}: {
   clearAll: () => void,
   undoLast: () => void
}) => {
   return (
      <div className="flex items-center">
         <button
            onClick={() => clearAll()}
            className="border border-slate-400 bg-white px-2 py-1 text-xs hover:bg-red-500 hover:text-white w-12 h-12"
         >
            <img src="/trashcan.webp" alt="" className="" />
         </button>
         <button
            onClick={() => {
               undoLast()
            }}
            className="border border-slate-400 bg-white text-xs hover:bg-slate-500 hover:text-white w-12 h-12"
         >
            <img src="/undo.webp" alt="" className="" />
         </button>
      </div>
   )
}

const StrokeSelector = ({
   strokeWidth,
   setStrokeWidth,
   strokeColor
}: {
   strokeWidth: number,
   setStrokeWidth: React.Dispatch<React.SetStateAction<number>>,
   strokeColor: string
}) => {
   const [open, setOpen] = useState(false)
   const wrapperRef = useRef<HTMLDivElement | null>(null)

   const SIZES = [6, 10, 14, 18, 22]

   useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
         if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
            setOpen(false)
         }
      }
      if (open) {
         document.addEventListener("mousedown", handleClickOutside)
      }
      return () => document.removeEventListener("mousedown", handleClickOutside)
   }, [open])

   return (
      <div ref={wrapperRef} className="relative mx-2">
         <button
            type="button"
            aria-label="Select stroke size"
            onClick={() => setOpen(o => !o)}
            className="flex items-center justify-center rounded-sm w-12 h-12 bg-white p-2 hover:bg-slate-100"
         >
            <span
               className="rounded-full"
               style={{
                  backgroundColor: strokeColor,
                  width: strokeWidth,
                  height: strokeWidth
               }}
            />
         </button>
         {open && (
            <div className="absolute left-1/2 z-20 mt-2 -translate-y-64 -translate-x-1/2 rounded-sm bg-white shadow-lg">
               <div className="flex flex-col max-h-52 overflow-y-auto">
                  {SIZES.map(size => {
                     const selected = size === strokeWidth
                     return (
                        <button
                           key={size}
                           onClick={() => {
                              setStrokeWidth(size)
                              setOpen(false)
                           }}
                           className={`flex items-center w-10 h-10 justify-center gap-2 py-1 hover:bg-slate-100 ${selected ? "bg-slate-200" : ""
                              }`}
                        >
                           <span
                              className="rounded-full border border-slate-300"
                              style={{
                                 backgroundColor: strokeColor,
                                 width: size,
                                 height: size
                              }}
                           />
                        </button>
                     )
                  })}
               </div>
            </div>
         )}
      </div>
   )
}

const MobileColorPreview = ({
   strokeColor,
   setStrokeColor
}: {
   strokeColor: string,
   setStrokeColor: React.Dispatch<React.SetStateAction<string>>
}) => {
   const [open, setOpen] = useState(false)
   const wrapperRef = useRef<HTMLDivElement | null>(null)

   useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
         if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
            setOpen(false)
         }
      }
      if (open) {
         document.addEventListener("pointerdown", handleClickOutside)
      }
      return () => document.removeEventListener("pointerdown", handleClickOutside)
   }, [open])

   return (
      <div ref={wrapperRef} className="relative">
         <button
            type="button"
            aria-label="Select color"
            onClick={() => setOpen(o => !o)}
            className={`flex items-center justify-center w-12 h-12`}
            style={{ backgroundColor: strokeColor }}
         >
         </button>
         {open && (
            <div className="fixed inset-x-0 top-[410px] bottom-96 z-30 px-2">
               <div className="shadow-lg w-full max-w-screen bg-white rounded-sm mx-auto">
                  <Palette
                     strokeColor={strokeColor}
                     setStrokeColor={(c) => {
                        setStrokeColor(c)
                        setOpen(false)
                     }}
                  />
               </div>
            </div>
         )}
      </div>
   )
}

export const NormalToolbar = ({
   strokeColor,
   setStrokeColor,
   strokeWidth,
   setStrokeWidth,
   clearAll,
   undoLast
}: {
   strokeColor: string,
   setStrokeColor: React.Dispatch<React.SetStateAction<string>>,
   strokeWidth: number,
   setStrokeWidth: React.Dispatch<React.SetStateAction<number>>,
   clearAll: () => void,
   undoLast: () => void
}) => {
   return (
      <div className="flex flex-row place-content-between">
         <Palette
            className="min-w-76"
            setStrokeColor={setStrokeColor}
         />
         <StrokeSelector
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
         />
         <UndoClear
            clearAll={clearAll}
            undoLast={undoLast}
         />
      </div>
   )
}