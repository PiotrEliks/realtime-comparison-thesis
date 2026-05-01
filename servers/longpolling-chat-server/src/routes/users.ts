// servers/longpolling-server/src/routes/users.ts

import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { User } from '@realtime-thesis/shared-server/models/chat';
import { Op } from 'sequelize';

export const usersRouter = Router();

usersRouter.use(authenticateToken);

// Get all users (for creating new chats)
usersRouter.get('/', async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { search } = req.query;

    let whereClause: any = {
      id: { [Op.ne]: currentUserId } // Exclude current user
    };

    // Optional search filter
    if (search) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { username: { [Op.iLike]: `%${search}%` } },
          { displayName: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ]
      };
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'username', 'email', 'displayName', 'avatarUrl', 'status', 'lastSeen'],
      order: [['username', 'ASC']],
      limit: 100
    });

    res.json({ 
      users: users.map(u => u.toJSON())
    });

  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID
usersRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: ['id', 'username', 'email', 'displayName', 'avatarUrl', 'status', 'lastSeen']
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: user.toJSON() });

  } catch (error: any) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: error.message });
  }
});
