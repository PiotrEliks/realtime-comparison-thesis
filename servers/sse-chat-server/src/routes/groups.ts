// servers/sse-server/src/routes/groups.ts

import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { RoomService } from '../services/RoomService.js';
import { MessageService } from '../services/MessageService.js';
import { sseManager } from '../index.js';

export const groupsRouter = Router();
const roomService = new RoomService();
const messageService = new MessageService();

groupsRouter.use(authenticateToken);

// Update group name
groupsRouter.put('/:roomId/name', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name } = req.body;
    const userId = req.user.id;

    // ✅ FAKTYCZNA OPERACJA NA BAZIE DANYCH
    await roomService.updateGroupName(roomId, userId, name);

    // Broadcast do wszystkich w pokoju
    sseManager.broadcastToRoom(roomId, {
      type: 'GROUP_NAME_UPDATED',
      payload: {
        roomId,
        name
      }
    });

    res.json({ success: true });

  } catch (error: any) {
    console.error('Error updating group name:', error);
    res.status(error.message.includes('Only admins') ? 403 : 500).json({ 
      error: error.message 
    });
  }
});

// Add member
groupsRouter.post('/:roomId/members', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId: newMemberId } = req.body;
    const userId = req.user.id;

    console.log('🔵 Add member request:', { roomId, newMemberId, adminUserId: userId });

    const member = await roomService.addMemberToGroup(roomId, userId, newMemberId);
    console.log('✅ Member added to DB:', member);

    // Dodaj użytkownika do pokoju w SSEManager
    sseManager.addUserToRoom(newMemberId, roomId);
    
    sseManager.broadcastToRoom(roomId, {
      type: 'MEMBER_ADDED',
      payload: { roomId, member }
    });
    console.log('📡 MEMBER_ADDED broadcast sent');


    res.json({ success: true, member });

  } catch (error: any) {
    console.error('Error adding member:', error);
    res.status(error.message.includes('Only admins') ? 403 : 500).json({ 
      error: error.message 
    });
  }
});

// Remove member
groupsRouter.delete('/:roomId/members/:memberId', async (req, res) => {
  try {
    const { roomId, memberId } = req.params;
    const userId = req.user.id;

    // ✅ FAKTYCZNA OPERACJA NA BAZIE DANYCH
    await roomService.removeMemberFromGroup(roomId, userId, memberId);

    // Broadcast do wszystkich w pokoju
    sseManager.broadcastToRoom(roomId, {
      type: 'MEMBER_REMOVED',
      payload: {
        roomId,
        userId: memberId
      }
    });

    // Powiadom usuniętego użytkownika
    sseManager.sendToClient(memberId, {
      type: 'REMOVED_FROM_GROUP',
      payload: {
        roomId
      }
    });

    // Usuń z SSEManager
    sseManager.removeUserFromRoom(memberId, roomId);

    res.json({ success: true });

  } catch (error: any) {
    console.error('Error removing member:', error);
    res.status(error.message.includes('Only admins') ? 403 : 500).json({ 
      error: error.message 
    });
  }
});

// Promote to admin
groupsRouter.post('/:roomId/members/:memberId/promote', async (req, res) => {
  try {
    const { roomId, memberId } = req.params;
    const userId = req.user.id;

    // ✅ FAKTYCZNA OPERACJA NA BAZIE DANYCH
    await roomService.promoteToAdmin(roomId, userId, memberId);

    // Broadcast do wszystkich w pokoju
    sseManager.broadcastToRoom(roomId, {
      type: 'MEMBER_PROMOTED',
      payload: {
        roomId,
        userId: memberId
      }
    });

    res.json({ success: true });

  } catch (error: any) {
    console.error('Error promoting member:', error);
    res.status(error.message.includes('Only admins') ? 403 : 500).json({ 
      error: error.message 
    });
  }
});

// Leave group
groupsRouter.post('/:roomId/leave', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    // ✅ FAKTYCZNA OPERACJA NA BAZIE DANYCH
    await roomService.leaveGroup(roomId, userId);

    // Broadcast do wszystkich w pokoju (oprócz opuszczającego)
    sseManager.broadcastToRoom(roomId, {
      type: 'MEMBER_LEFT',
      payload: {
        roomId,
        userId
      }
    }, userId);

    // Powiadom opuszczającego
    sseManager.sendToClient(userId, {
      type: 'LEFT_GROUP',
      payload: {
        roomId
      }
    });

    // Usuń z SSEManager
    sseManager.removeUserFromRoom(userId, roomId);

    res.json({ success: true });

  } catch (error: any) {
    console.error('Error leaving group:', error);
    res.status(500).json({ error: error.message });
  }
});