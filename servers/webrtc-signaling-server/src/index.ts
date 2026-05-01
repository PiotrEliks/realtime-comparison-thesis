// servers/webrtc-server/src/index.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '@realtime-thesis/shared-server/config/chat/database';
import { initializeAssociations } from '@realtime-thesis/shared-server/models/chat';
import { SignalingServer } from './services/SignalingServer.js';

// Routes
import { authRouter } from './routes/auth.js';
import { roomsRouter } from './routes/rooms.js';
import { messagesRouter } from './routes/messages.js';
import { reactionsRouter } from './routes/reactions.js';
import { typingRouter } from './routes/typing.js';
import { groupsRouter } from './routes/groups.js';
import { usersRouter } from './routes/users.js';
import { uploadRouter } from './routes/upload.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4004;
const WS_PORT = process.env.WS_PORT || 4005;

// ✅ EXPORT signalingServer globally
export let signalingServer: SignalingServer;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5176',
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
    service: 'WebRTC Chat Server',
    port: PORT,
    wsPort: WS_PORT,
    onlineUsers: signalingServer?.getOnlineUsers() || 0,
    uptime: process.uptime()
  });
});

// REST API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/rooms', groupsRouter);
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

// Initialize database and start servers
async function startServer() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected');

    console.log('🔄 Initializing model associations...');
    initializeAssociations();
    console.log('✅ Model associations initialized');

    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: false });
      console.log('✅ Database synced');
    }

    // Start REST API server
    app.listen(PORT, () => {
      console.log('');
      console.log('╔════════════════════════════════════════════╗');
      console.log('║   🚀 WEBRTC CHAT SERVER STARTED           ║');
      console.log('╠════════════════════════════════════════════╣');
      console.log(`║   REST API Port:  ${PORT}                     ║`);
      console.log(`║   WebSocket Port: ${WS_PORT}                     ║`);
      console.log(`║   Environment:    ${process.env.NODE_ENV || 'development'}       ║`);
      console.log('║   Database:       PostgreSQL               ║');
      console.log('║   Shared uploads: ✅                        ║');
      console.log('╠════════════════════════════════════════════╣');
      console.log('║   Architecture:                            ║');
      console.log('║   • REST API - Data persistence           ║');
      console.log('║   • WebSocket - Signaling for WebRTC      ║');
      console.log('║   • WebRTC Data Channels - P2P messages   ║');
      console.log('║   • SignalingServer broadcasts DB changes ║');
      console.log('╚════════════════════════════════════════════╝');
      console.log('');
    });

    // Start WebSocket Signaling Server
    signalingServer = new SignalingServer(Number(WS_PORT));
    console.log('📡 WebRTC Signaling Server ready!');
    console.log('💡 SignalingServer will broadcast DB changes to all connected clients');
    console.log('');

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
