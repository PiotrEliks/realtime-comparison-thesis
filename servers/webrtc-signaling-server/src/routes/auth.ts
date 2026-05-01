import { Router } from 'express';
import { AuthService } from '@realtime-thesis/shared-server/services/chat/AuthService';

export const authRouter = Router();
const authService = new AuthService();

authRouter.post('/register', async (req, res) => {
  try {
    const { username, password, email, displayName } = req.body;
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password and email are required' });
    }
    const result = await authService.register(username, password, email, displayName);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const result = await authService.login(username, password);
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});
