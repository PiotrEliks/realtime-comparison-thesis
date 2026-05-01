// servers/longpolling-server/src/routes/typing.ts

import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { longPollingManager } from '../index.js';

export const typingRouter = Router();

typingRouter.use(authenticateToken);

// Start typing
typingRouter.post('/start', async (req, res) => {
  try {
    const { roomId } = req.body;
    const userId = req.user.id;

    // Broadcast USER_TYPING (exclude sender)
    longPollingManager.broadcastToRoom(roomId, 'USER_TYPING', {
      roomId,
      userId,
      username: req.user.username,
      displayName: req.user.displayName
    }, userId);

    res.json({ success: true });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop typing
typingRouter.post('/stop', async (req, res) => {
  try {
    const { roomId } = req.body;
    const userId = req.user.id;

    // Broadcast USER_STOPPED_TYPING (exclude sender)
    longPollingManager.broadcastToRoom(roomId, 'USER_STOPPED_TYPING', {
      roomId,
      userId,
      username: req.user.username,
      displayName: req.user.displayName
    }, userId);

    res.json({ success: true });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
