import type { UiMessage, WSMessage } from "@/types/types";

export default function normalizeInbound(msg: WSMessage): UiMessage | null {
   // If server (legacy) wraps under type 'message' with inner msg.data.type, unwrap
   const baseType = msg.type === 'message' && msg.data?.type ? msg.data.type : msg.type;
   const payload = msg.type === 'message' && msg.data?.data ? msg.data.data : msg.data;

   switch (baseType) {
      case 'chat_msg':
         return {
            type: 'chat_msg',
            sender: payload.sender ?? {
               ID: payload.playerId ?? 'unknown',
               Name: payload.playerName ?? 'User',
               Points: payload.sender?.Points ?? 0
            },
            message: payload.message ?? ''
         };
      case 'correct_guess':
         return {
            type: 'correct_guess',
            playerId: payload.playerId,
            playerName: payload.playerName,
            message: payload.message
         };
      case 'close_guess':
         return {
            type: 'close_guess',
            playerId: payload.playerId,
            playerName: payload.playerName,
            editDistance: payload.editDistance ?? 0,
            message: payload.message
         };
      default:
         return null;
   }
}

