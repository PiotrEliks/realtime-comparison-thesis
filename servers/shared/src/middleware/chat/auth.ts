import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/chat/AuthService';

const authService = new AuthService();

// Rozszerzenie Request o user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const user = await authService.getUserFromToken(token);
  
  if (!user) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  req.user = user;
  next();
}
