// servers/webrtc-server/src/routes/rooms.ts

import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { RoomService } from '../services/RoomService.js';
import { MessageService } from '../services/MessageService.js';

export const roomsRouter = Router();
const roomService = new RoomService();
const messageService = new MessageService();

roomsRouter.use(authenticateToken);

// Get user's rooms
roomsRouter.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const rooms = await roomService.getUserRooms(userId);
    res.json({ rooms });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create private room
roomsRouter.post('/private', async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user.id;

    const room = await roomService.createPrivateRoom(userId, targetUserId);
    
    // WebRTC: Users will join via WebSocket signaling

    res.json({ success: true, room });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create group room
roomsRouter.post('/group', async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    const userId = req.user.id;

    const room = await roomService.createGroupRoom(name, userId, memberIds);
    
    // WebRTC: Members will join via WebSocket signaling

    res.json({ success: true, room });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get room details
roomsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!(await roomService.isMember(id, userId))) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const room = await roomService.getRoomById(id);
    res.json({ room });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Join room (load messages) - called by client before WebSocket join
roomsRouter.post('/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const room = await roomService.getRoomById(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const messages = await messageService.getRoomMessages(id, 50);

    // WebRTC: Client will join room via WebSocket after getting this data

    res.json({ success: true, room, messages });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
