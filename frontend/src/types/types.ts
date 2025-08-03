import { type Point as Pt } from "react-sketch-canvas";

export type Stroke = {
   strokeColor: string;
   strokeWidth: number;
   paths: Pt[];
}

export type WSMessage = {
   type: 'draw_point' | 'stroke' | 'clear' | 'undo' | 'user_joined' | 'user_left' | 'game_state';
   data: any;
}

export type Point = {
   type: 'start' | 'move' | 'end';
   x: number;
   y: number;
}


