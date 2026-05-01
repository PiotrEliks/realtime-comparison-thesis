import { Request, Response } from 'express';
import { AuthService } from '@realtime-thesis/shared-server/services/chat/AuthService';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  register = async (req: Request, res: Response) => {
    try {
      const { username, email, password, displayName } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await this.authService.register(username, email, password, displayName);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  login = async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await this.authService.login(username, password);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  };

  logout = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      await this.authService.logout(userId);
      res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  getMe = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      res.json({ user });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };
}