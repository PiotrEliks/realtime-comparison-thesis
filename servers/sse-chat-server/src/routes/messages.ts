import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { MessageService } from '../services/MessageService.js';
import { RoomService } from '../services/RoomService.js';
import { sseManager } from '../index.js';

export const messagesRouter = Router();
const messageService = new MessageService();
const roomService = new RoomService();

messagesRouter.use(authenticateToken);

messagesRouter.post('/', async (req, res) => {
  try {
    const { roomId, content, replyToId } = req.body;
    const userId = req.user.id;

    if (!(await roomService.isMember(roomId, userId))) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const isImage = content.startsWith('[IMAGE]');
    const messageType = isImage ? 'file' : 'text';

    const message = await messageService.createMessage({
      roomId,
      userId,
      content,
      type: messageType,
      replyToId
    });

    const fullMessage = await messageService.getMessageWithDetails(message.id);

    sseManager.broadcastToRoom(roomId, {
      type: 'NEW_MESSAGE',
      payload: fullMessage
    });

    res.json({ success: true, message: fullMessage });

  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

messagesRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const message = await messageService.updateMessage(id, userId, content);

    sseManager.broadcastToRoom(message.roomId, {
      type: 'MESSAGE_EDITED',
      payload: {
        messageId: id,
        content,
        isEdited: true,
        editedAt: message.editedAt
      }
    });

    res.json({ success: true, message });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

messagesRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const message = await messageService.deleteMessage(id, userId);

    sseManager.broadcastToRoom(message.roomId, {
      type: 'MESSAGE_DELETED',
      payload: {
        messageId: id,
        isDeleted: true
      }
    });

    res.json({ success: true });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

messagesRouter.post('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const receipt = await messageService.markAsRead(id, userId);
    const message = await messageService.getMessageWithDetails(id);

    if (message) {
      sseManager.sendToClient(message.author.id, {
        type: 'MESSAGE_READ',
        payload: {
          messageId: id,
          userId,
          userName: req.user.displayName || req.user.username,
          readAt: receipt.readAt
        }
      });
    }

    res.json({ success: true });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

messagesRouter.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { before, limit } = req.query;
    const userId = req.user.id;

    if (!(await roomService.isMember(roomId, userId))) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const messages = await messageService.getRoomMessages(
      roomId,
      parseInt(limit as string) || 50,
      before ? new Date(before as string) : undefined
    );

    res.json({ messages });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
