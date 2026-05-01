// servers/longpolling-server/src/index.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '@realtime-thesis/shared-server/config/chat/database';
import { initializeAssociations } from '@realtime-thesis/shared-server/models/chat';
import { LongPollingManager } from './services/LongPollingManager';

// Routes
import { authRouter } from './routes/auth';
import { pollRouter } from './routes/poll';
import { roomsRouter } from './routes/rooms.js';
import { messagesRouter } from './routes/messages.js';
import { reactionsRouter } from './routes/reactions.js';
import { typingRouter } from './routes/typing.js';
import { groupsRouter } from './routes/groups.js';
import { usersRouter } from './routes/users';
import { uploadRouter } from './routes/upload';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4003;

// Initialize Long Polling Manager (export dla routes)
export const longPollingManager = new LongPollingManager();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5175',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Shared uploads directory
const SHARED_UPLOADS_DIR = path.join(__dirname, '../../shared/uploads');
app.use('/uploads', express.static(SHARED_UPLOADS_DIR));
console.log('📁 Serving uploads from:', SHARED_UPLOADS_DIR);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'Long Polling Chat Server',
    port: PORT,
    activeSessions: longPollingManager.getActiveSessionsCount(),
    uptime: process.uptime()
  });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/poll', pollRouter);
app.use('/api/users', usersRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/rooms', groupsRouter);  // Group management routes
app.use('/api/messages', messagesRouter);
app.use('/api/reactions', reactionsRouter);
app.use('/api/typing', typingRouter);
app.use('/api/upload', uploadRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected');

    console.log('🔄 Initializing model associations...');
    initializeAssociations();
    console.log('✅ Model associations initialized');

    // Sync database (tylko dla development!)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: false });
      console.log('✅ Database synced');
    }

    app.listen(PORT, () => {
      console.log('');
      console.log('╔════════════════════════════════════════════╗');
      console.log('║   🚀 LONG POLLING CHAT SERVER STARTED     ║');
      console.log('╠════════════════════════════════════════════╣');
      console.log(`║   Port:           ${PORT}                     ║`);
      console.log(`║   Environment:    ${process.env.NODE_ENV || 'development'}       ║`);
      console.log(`║   Poll Timeout:   ${process.env.POLL_TIMEOUT || '30000'}ms              ║`);
      console.log(`║   Max Events:     ${process.env.MAX_EVENTS_PER_POLL || '50'}                  ║`);
      console.log('║   Database:       PostgreSQL               ║');
      console.log('║   Shared uploads: ✅                        ║');
      console.log('╠════════════════════════════════════════════╣');
      console.log('║   Endpoints:                               ║');
      console.log('║   GET  /api/poll          - Long polling   ║');
      console.log('║   POST /api/poll/heartbeat - Keepalive    ║');
      console.log('║   POST /api/auth/login    - Login         ║');
      console.log('║   POST /api/auth/register - Register      ║');
      console.log('║   GET  /api/users         - Users list    ║');
      console.log('║   GET  /api/rooms         - User rooms    ║');
      console.log('║   POST /api/rooms/private - Private room  ║');
      console.log('║   POST /api/rooms/group   - Group room    ║');
      console.log('║   POST /api/messages      - Send message  ║');
      console.log('║   GET  /health            - Health check  ║');
      console.log('╚════════════════════════════════════════════╝');
      console.log('');
      console.log('📡 Long Polling Manager initialized');
      console.log(`⏱️  Poll timeout: ${process.env.POLL_TIMEOUT || 30000}ms`);
      console.log(`📊 Max events per poll: ${process.env.MAX_EVENTS_PER_POLL || 50}`);
      console.log('');
      console.log('💡 Ready to accept connections!');
      console.log('');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await sequelize.close();
  process.exit(0);
});

// Start server
startServer();