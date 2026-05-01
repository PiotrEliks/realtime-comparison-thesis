// servers/webrtc-server/src/routes/groups.ts

import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { RoomService } from '../services/RoomService.js';
import { signalingServer } from '../index.js';

export const groupsRouter = Router();
const roomService = new RoomService();

groupsRouter.use(authenticateToken);

// Update group name
groupsRouter.put('/:roomId/name', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name } = req.body;
    const userId = req.user.id;

    await roomService.updateGroupName(roomId, userId, name);

    // ✅ Broadcast via SignalingServer
    if (signalingServer) {
      signalingServer.broadcastGroupNameUpdate(roomId, name);
    }

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

    const member = await roomService.addMemberToGroup(roomId, userId, newMemberId);

    // ✅ Broadcast via SignalingServer
    if (signalingServer) {
      signalingServer.broadcastMemberAdded(roomId, member);
    }

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

    await roomService.removeMemberFromGroup(roomId, userId, memberId);

    // ✅ Broadcast via SignalingServer
    if (signalingServer) {
      signalingServer.broadcastMemberRemoved(roomId, memberId);
    }

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

    await roomService.promoteToAdmin(roomId, userId, memberId);

    // ✅ Broadcast via SignalingServer
    if (signalingServer) {
      signalingServer.broadcastMemberPromoted(roomId, memberId);
    }

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

    await roomService.leaveGroup(roomId, userId);

    // ✅ Broadcast via SignalingServer
    if (signalingServer) {
      signalingServer.broadcastMemberRemoved(roomId, userId);
    }

    res.json({ success: true });

  } catch (error: any) {
    console.error('Error leaving group:', error);
    res.status(500).json({ error: error.message });
  }
});
