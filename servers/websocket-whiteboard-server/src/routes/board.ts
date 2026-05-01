// websocket-whiteboard-server/src/routes/boards.ts

import { Router } from 'express';
import { Board, BoardMember, User } from '@realtime-thesis/shared-server/models/whiteboard';

export const boardsRouter = Router();

let wsServer: any = null;

export function setWebSocketServer(server: any) {
  wsServer = server;
}

// Get all boards for user
boardsRouter.get('/', async (req, res) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const memberships = await BoardMember.findAll({
      where: { userId },
      include: [{
        model: Board,
        as: 'board',
        include: [{
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'displayName']
        }]
      }]
    });

    const boards = memberships.map(m => ({
      ...(m as any).board.toJSON(),
      role: m.role,
      memberCount: 0 // Will be populated by WebSocket
    }));

    res.json({ boards });
  } catch (error: any) {
    console.error('Error fetching boards:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get board by ID
boardsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;

    const board = await Board.findByPk(id, {
      include: [{
        model: User,
        as: 'creator',
        attributes: ['id', 'username', 'displayName']
      }]
    });

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check access
    const membership = await BoardMember.findOne({
      where: { boardId: id, userId }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ 
      board: {
        ...board.toJSON(),
        role: membership.role
      }
    });
  } catch (error: any) {
    console.error('Error fetching board:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new board
boardsRouter.post('/', async (req, res) => {
  try {
    const { name, description, userId } = req.body;

    if (!name || !userId) {
      return res.status(400).json({ error: 'name and userId required' });
    }

    const board = await Board.create({
      name,
      description,
      createdBy: userId,
      elements: []
    });

    // Add creator as owner
    await BoardMember.create({
      boardId: board.id,
      userId,
      role: 'owner'
    });

    res.json({ board });
  } catch (error: any) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update board name/description
boardsRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, userId } = req.body;

    // Check if user is owner/editor
    const membership = await BoardMember.findOne({
      where: { boardId: id, userId }
    });

    if (!membership || membership.role === 'viewer') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const board = await Board.findByPk(id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    await board.update({ 
      ...(name && { name }),
      ...(description !== undefined && { description })
    });

    res.json({ board });
  } catch (error: any) {
    console.error('Error updating board:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete board
boardsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;

    // Check if user is owner
    const membership = await BoardMember.findOne({
      where: { boardId: id, userId }
    });

    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can delete board' });
    }

    const board = await Board.findByPk(id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    await board.destroy();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add member to board
boardsRouter.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: requestUserId, newUserId, role } = req.body;

    // Check if requester is owner
    const membership = await BoardMember.findOne({
      where: { boardId: id, userId: requestUserId }
    });

    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can add members' });
    }

    // Add new member
    const newMember = await BoardMember.create({
      boardId: id,
      userId: newUserId,
      role: role || 'editor'
    });

    const newUser = await User.findByPk(newUserId);

    if (wsServer && newUser) {
      wsServer.notifyUserAddedToBoard(newUserId, {
        boardId: id,
        role: role || 'editor',
        addedBy: requestUserId
      });
    }

    res.json({ member: newMember });
  } catch (error: any) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove member from board
boardsRouter.delete('/:id/members/:memberId', async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.query.userId as string;

    // Check if requester is owner
    const membership = await BoardMember.findOne({
      where: { boardId: id, userId }
    });

    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can remove members' });
    }

    const memberToRemove = await User.findByPk(memberId);

    await BoardMember.destroy({
      where: { boardId: id, userId: memberId }
    });

    if (wsServer && memberToRemove) {
      wsServer.notifyUserRemovedFromBoard(memberId, {
        boardId: id,
        removedBy: userId
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get board members
boardsRouter.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;

    const members = await BoardMember.findAll({
      where: { boardId: id },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'displayName', 'cursorColor']
      }]
    });

    res.json({ 
      members: members.map(m => ({
        ...((m as any).user.toJSON()),
        role: m.role,
        joinedAt: m.joinedAt
      }))
    });
  } catch (error: any) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: error.message });
  }
});
