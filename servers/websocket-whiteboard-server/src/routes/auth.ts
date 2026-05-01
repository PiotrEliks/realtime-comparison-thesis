// websocket-whiteboard-server/src/routes/auth.ts - WITH GET ALL USERS

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '@realtime-thesis/shared-server/models/whiteboard';

export const authRouter = Router();

// Register
authRouter.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, and password required' });
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      passwordHash,
      displayName: displayName || username
    });

    res.json({
      token: user.id,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        cursorColor: user.cursorColor
      }
    });
  } catch (error: any) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      token: user.id,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        cursorColor: user.cursorColor
      }
    });
  } catch (error: any) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user
authRouter.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const user = await User.findByPk(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        cursorColor: user.cursorColor
      }
    });
  } catch (error: any) {
    console.error('Error verifying token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Find user by username
authRouter.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({
      where: { username },
      attributes: ['id', 'username', 'displayName', 'cursorColor']
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error: any) {
    console.error('Error finding user:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ NEW: Get all users (for dropdown)
authRouter.get('/users', async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'displayName', 'cursorColor'],
      order: [['username', 'ASC']]
    });

    res.json({ users });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});