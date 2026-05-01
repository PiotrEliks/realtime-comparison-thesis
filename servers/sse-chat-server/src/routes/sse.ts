import { Router } from 'express';
import { sseManager } from '../index.js';
import { AuthService } from '@realtime-thesis/shared-server/services/chat/AuthService';
import { RoomService } from '../services/RoomService.js';

export const sseRouter = Router();
const authService = new AuthService();
const roomService = new RoomService();

sseRouter.get('/', async (req, res) => {
  try {
    const token = req.query.token as string;
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const user = await authService.getUserFromToken(token);
    
    if (!user) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }

    await user.update({ status: 'online', lastSeen: new Date() });

    const userRooms = await roomService.getUserRooms(user.id);
    const roomIds = userRooms.map(r => r.id);

    sseManager.addClient(user.id, res, user, roomIds);

    sseManager.sendToClient(user.id, {
      type: 'CONNECTED',
      payload: {
        user: user.toJSON(),
        rooms: userRooms
      }
    });

    roomIds.forEach(roomId => {
      sseManager.broadcastToRoom(roomId, {
        type: 'USER_STATUS_CHANGE',
        payload: {
          userId: user.id,
          status: 'online'
        }
      }, user.id);
    });

  } catch (error: any) {
    console.error('SSE connection error:', error);
    res.status(500).json({ error: error.message });
  }
});
