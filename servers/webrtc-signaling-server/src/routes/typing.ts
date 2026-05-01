// servers/webrtc-server/src/routes/typing.ts

import { Router } from 'express';

export const typingRouter = Router();

// WebRTC: Typing indicators are sent directly via WebSocket signaling
// No REST API endpoints needed - handled by SignalingServer

typingRouter.get('/', (req, res) => {
  res.json({ 
    message: 'Typing indicators handled via WebSocket signaling',
    websocket: 'ws://localhost:4005'
  });
});
