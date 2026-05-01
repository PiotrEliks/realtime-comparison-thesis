import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { RoomService } from '../services/RoomService.js';
import { MessageService } from '../services/MessageService.js';
import { sseManager } from '../index.js';

export const roomsRouter = Router();
const roomService = new RoomService();
const messageService = new MessageService();

roomsRouter.use(authenticateToken);

roomsRouter.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const rooms = await roomService.getUserRooms(userId);
    res.json({ rooms });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

roomsRouter.post('/private', async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user.id;

    const room = await roomService.createPrivateRoom(userId, targetUserId);
    
    sseManager.addUserToRoom(userId, room.id);
    sseManager.addUserToRoom(targetUserId, room.id);

    res.json({ success: true, room });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

roomsRouter.post('/group', async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    const userId = req.user.id;

    const room = await roomService.createGroupRoom(name, userId, memberIds);
    
    sseManager.addUserToRoom(userId, room.id);
    memberIds.forEach((memberId: string) => {
      sseManager.addUserToRoom(memberId, room.id);
    });

    res.json({ success: true, room });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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

roomsRouter.post('/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const room = await roomService.getRoomById(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const messages = await messageService.getRoomMessages(id, 50);

    sseManager.addUserToRoom(userId, id);

    sseManager.sendToClient(userId, {
      type: 'ROOM_JOINED',
      payload: {
        room,
        messages
      }
    });

    sseManager.broadcastToRoom(id, {
      type: 'USER_JOINED_ROOM',
      payload: {
        roomId: id,
        userId,
        username: req.user.username,
        displayName: req.user.displayName
      }
    }, userId);

    res.json({ success: true, room, messages });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
