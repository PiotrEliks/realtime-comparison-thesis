import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { sseManager } from '../index.js';

export const typingRouter = Router();

typingRouter.use(authenticateToken);

typingRouter.post('/start', async (req, res) => {
  try {
    const { roomId } = req.body;
    const userId = req.user.id;

    sseManager.broadcastToRoom(roomId, {
      type: 'USER_TYPING',
      payload: {
        roomId,
        userId,
        username: req.user.username,
        displayName: req.user.displayName
      }
    }, userId);

    res.json({ success: true });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

typingRouter.post('/stop', async (req, res) => {
  try {
    const { roomId } = req.body;
    const userId = req.user.id;

    sseManager.broadcastToRoom(roomId, {
      type: 'USER_STOPPED_TYPING',
      payload: {
        roomId,
        userId,
        username: req.user.username,
        displayName: req.user.displayName
      }
    }, userId);

    res.json({ success: true });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
