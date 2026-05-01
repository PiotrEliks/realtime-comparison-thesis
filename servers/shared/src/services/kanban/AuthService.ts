import jwt from 'jsonwebtoken';
import { User } from '../../models/kanban';

const JWT_SECRET  = process.env.JWT_SECRET || 'kanban-secret-key';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

export class AuthService {
  generateToken(userId: string): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  }

  verifyToken(token: string): { userId: string } {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  }

  async getUserFromToken(token: string): Promise<User | null> {
    try {
      const { userId } = this.verifyToken(token);
      return await User.findByPk(userId);
    } catch { return null; }
  }

  async login(usernameOrEmail: string, password: string) {
    const field = usernameOrEmail.includes('@') ? 'email' : 'username';
    const user  = await User.findOne({ where: { [field]: usernameOrEmail } });
    if (!user) throw new Error('Invalid credentials');
    const valid = await user.validatePassword(password);
    if (!valid) throw new Error('Invalid credentials');
    return { token: this.generateToken(user.id), user: user.toPublic() };
  }

  async register(username: string, email: string, password: string, displayName?: string) {
    const exists = await User.findOne({ where: { username } });
    if (exists) throw new Error('Username already taken');
    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ username, email, passwordHash, displayName: displayName || username, color: randomColor() });
    return { token: this.generateToken(user.id), user: user.toPublic() };
  }
}

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#06b6d4','#f97316'];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];