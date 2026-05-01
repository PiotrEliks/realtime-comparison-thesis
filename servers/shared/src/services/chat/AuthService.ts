import jwt from 'jsonwebtoken';
import { User } from '../../models/chat/index.js';

export class AuthService {
  private jwtSecret: string;
  private jwtExpiresIn: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
  }

  async register(username: string, email: string, password: string, displayName?: string) {
    // Check if user exists
    const existingUser = await User.findOne({
      where: { 
        username 
      }
    });

    if (existingUser) {
      throw new Error('Username already exists');
    }

    const existingEmail = await User.findOne({
      where: { email }
    });

    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Create user
    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      username,
      email,
      passwordHash,
      displayName: displayName || username,
      status: 'online'
    });

    const token = this.generateToken(user.id);

    return {
      token,
      user: user.toJSON()
    };
  }

  async login(usernameOrEmail: string, password: string) {
    // Find user by username or email
    const user = await User.findOne({
      where: {
        [usernameOrEmail.includes('@') ? 'email' : 'username']: usernameOrEmail
      }
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Validate password
    const isValid = await user.validatePassword(password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Update status
    await user.update({ status: 'online', lastSeen: new Date() });

    const token = this.generateToken(user.id);

    return {
      token,
      user: user.toJSON()
    };
  }

  async logout(userId: string) {
    const user = await User.findByPk(userId);
    if (user) {
      await user.update({ status: 'offline', lastSeen: new Date() });
    }
  }

  generateToken(userId: string): string {
    return jwt.sign({ userId }, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });
  }

  verifyToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      return decoded;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async getUserFromToken(token: string): Promise<User | null> {
    try {
      const { userId } = this.verifyToken(token);
      const user = await User.findByPk(userId);
      return user;
    } catch (error) {
      return null;
    }
  }
}