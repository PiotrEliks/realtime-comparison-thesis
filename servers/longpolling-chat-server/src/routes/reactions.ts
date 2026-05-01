// servers/longpolling-server/src/routes/reactions.ts

import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { ReactionService } from '../services/ReactionService.js';
import { MessageService } from '../services/MessageService.js';
import { longPollingManager } from '../index.js';

export const reactionsRouter = Router();
const reactionService = new ReactionService();
const messageService = new MessageService();

reactionsRouter.use(authenticateToken);

// Add reaction
reactionsRouter.post('/', async (req, res) => {
  try {
    const { messageId, emoji } = req.body;
    const userId = req.user.id;

    await reactionService.addReaction(messageId, userId, emoji);

    const message = await messageService.getMessageWithDetails(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const reactions = await reactionService.getMessageReactions(messageId);

    // Broadcast REACTION_ADDED
    longPollingManager.broadcastToRoom(message.roomId, 'REACTION_ADDED', {
      messageId,
      userId,
      emoji,
      reactions
    });

    res.json({ success: true, reactions });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove reaction
reactionsRouter.delete('/', async (req, res) => {
  try {
    const { messageId, emoji } = req.body;
    const userId = req.user.id;

    await reactionService.removeReaction(messageId, userId, emoji);

    const message = await messageService.getMessageWithDetails(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const reactions = await reactionService.getMessageReactions(messageId);

    // Broadcast REACTION_REMOVED
    longPollingManager.broadcastToRoom(message.roomId, 'REACTION_REMOVED', {
      messageId,
      userId,
      emoji,
      reactions
    });

    res.json({ success: true, reactions });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
