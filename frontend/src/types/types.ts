import { type Point as Pt } from "react-sketch-canvas";

export type Stroke = {
   strokeColor: string;
   strokeWidth: number;
   paths: Pt[];
}

export type WSMessage = {
   // Server can send these directly
   type:
   | 'draw_point'
   | 'stroke'
   | 'clear'
   | 'undo'
   | 'user_joined'
   | 'user_left'
   | 'game_state'
   | 'guess'
   | 'chat_msg'
   | 'correct_guess'
   | 'close_guess'
   | 'message'; // (legacy wrapper)
   data: any;
};

// Discriminated union (flat)
export interface ChatMsg {
   type: 'chat_msg';
   sender: Player;
   message: string;
}

export interface CorrectGuessMsg {
   type: 'correct_guess';
   playerId: string;
   playerName: string;
   message: string;
}

export interface CloseGuessMsg {
   type: 'close_guess';
   playerId: string;
   playerName: string;
   editDistance: number;
   message?: string;
}

export type UiMessage = ChatMsg | CorrectGuessMsg | CloseGuessMsg;
// Remove old Message shape

export type Point = {
   type: 'start' | 'move' | 'end';
   x: number;
   y: number;
   pointColor: string;
   pointSize: number;
}

export type Player = {
   ID: string;
   Name: string;
   Points: number
}

export type Color = string