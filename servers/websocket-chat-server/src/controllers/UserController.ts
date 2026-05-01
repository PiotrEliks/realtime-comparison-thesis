import { Request, Response } from 'express';
import { User } from '@realtime-thesis/shared-server/models/chat';
import { Op } from 'sequelize';

export class UserController {
  
  searchUsers = async (req: Request, res: Response) => {
    try {
      const { query } = req.query;
      const currentUserId = (req as any).user.id;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query parameter required' });
      }

      const users = await User.findAll({
        where: {
          id: { [Op.ne]: currentUserId }, // Exclude current user
          [Op.or]: [
            { username: { [Op.iLike]: `%${query}%` } },
            { displayName: { [Op.iLike]: `%${query}%` } },
            { email: { [Op.iLike]: `%${query}%` } }
          ]
        },
        attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status'],
        limit: 10
      });

      res.json({ users });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  getAllUsers = async (req: Request, res: Response) => {
    try {
      const currentUserId = (req as any).user.id;

      const users = await User.findAll({
        where: {
          id: { [Op.ne]: currentUserId }
        },
        attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status'],
        order: [['username', 'ASC']]
      });

      res.json({ users });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };
}