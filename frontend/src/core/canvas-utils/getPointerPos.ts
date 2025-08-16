import type React from "react";

export default function pointerPos(e: React.PointerEvent, canvasRef: React.RefObject<HTMLCanvasElement | null>) {
   const canvas = canvasRef.current!;
   const rect = canvas.getBoundingClientRect();
   return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
   };
};

