// servers/longpolling-server/src/routes/messages.ts

import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { MessageService } from '../services/MessageService.js';
import { RoomService } from '../services/RoomService.js';
import { longPollingManager } from '../index.js';

export const messagesRouter = Router();
const messageService = new MessageService();
const roomService = new RoomService();

messagesRouter.use(authenticateToken);

// Send message
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

    // Broadcast NEW_MESSAGE to all in room
    longPollingManager.broadcastToRoom(roomId, 'NEW_MESSAGE', fullMessage);

    res.json({ success: true, message: fullMessage });

  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Edit message
messagesRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const message = await messageService.updateMessage(id, userId, content);

    // Broadcast MESSAGE_EDITED
    longPollingManager.broadcastToRoom(message.roomId, 'MESSAGE_EDITED', {
      messageId: id,
      content,
      isEdited: true,
      editedAt: message.editedAt
    });

    res.json({ success: true, message });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete message
messagesRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const message = await messageService.deleteMessage(id, userId);

    // Broadcast MESSAGE_DELETED
    longPollingManager.broadcastToRoom(message.roomId, 'MESSAGE_DELETED', {
      messageId: id,
      isDeleted: true
    });

    res.json({ success: true });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Mark message as read
messagesRouter.post('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const receipt = await messageService.markAsRead(id, userId);
    const message = await messageService.getMessageWithDetails(id);

    if (message) {
      // Send MESSAGE_READ to message author
      longPollingManager.addEventToUser(message.author.id, 'MESSAGE_READ', {
        messageId: id,
        userId,
        userName: req.user.displayName || req.user.username,
        readAt: receipt.readAt
      });
    }

    res.json({ success: true });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get room messages (with pagination)
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
