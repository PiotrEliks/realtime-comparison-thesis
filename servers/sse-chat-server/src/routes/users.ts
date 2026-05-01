import { Router } from 'express';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import { User } from '@realtime-thesis/shared-server/models/chat';
import { Op } from 'sequelize';

export const usersRouter = Router();
usersRouter.use(authenticateToken);

// Get all users
usersRouter.get('/', async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { search } = req.query;

    let whereClause: any = {
      id: { [Op.ne]: currentUserId } // Exclude current user
    };

    if (search) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { username: { [Op.iLike]: `%${search}%` } },
          { displayName: { [Op.iLike]: `%${search}%` } }
        ]
      };
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'username', 'email', 'displayName', 'avatarUrl', 'status'],
      order: [['username', 'ASC']],
      limit: 100
    });

    res.json({ users: users.map(u => u.toJSON()) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});