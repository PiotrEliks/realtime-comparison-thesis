import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import dotenv from 'dotenv';
import { sequelize, testConnection } from '@realtime-thesis/shared-server/config/chat/database';
import { initializeAssociations } from '@realtime-thesis/shared-server/models/chat';
import { router } from './routes/index.js';
import { ChatManager } from './websocket/ChatManager.js';
import '@realtime-thesis/shared-server/models/chat'; // Import relationships

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '4001');

// Middleware
app.use(cors());
app.use(express.json());

const SHARED_UPLOADS_DIR = path.join(__dirname, '../../shared/uploads');
app.use('/uploads', express.static(SHARED_UPLOADS_DIR));
console.log('📁 Serving uploads from:', SHARED_UPLOADS_DIR);

// Routes
app.use('/api', router);

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  path: '/ws'
});

// Initialize chat manager
const chatManager = new ChatManager();

// WebSocket connection handler
wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'No token provided' } }));
    ws.close();
    return;
  }

  chatManager.handleConnection(ws, token);
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }

    initializeAssociations();

    // Sync database (in production use migrations)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Database synced');
    }

    // Start server
    server.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════');
      console.log('🚀 WebSocket Chat Server');
      console.log('═══════════════════════════════════════════');
      console.log(`🌐 REST API:    http://localhost:${PORT}/api`);
      console.log(`📡 WebSocket:   ws://localhost:${PORT}/ws`);
      console.log(`❤️  Health:      http://localhost:${PORT}/api/health`);
      console.log('═══════════════════════════════════════════');
      console.log('');
      console.log('📋 Available endpoints:');
      console.log('   POST /api/auth/register');
      console.log('   POST /api/auth/login');
      console.log('   GET  /api/auth/me');
      console.log('   GET  /api/rooms');
      console.log('   POST /api/rooms/private');
      console.log('   POST /api/rooms/group');
      console.log('   GET  /api/rooms/:roomId/messages');
      console.log('');
      console.log('🔌 WebSocket events:');
      console.log('   SEND_MESSAGE');
      console.log('   JOIN_ROOM');
      console.log('   LEAVE_ROOM');
      console.log('   TYPING_START');
      console.log('   TYPING_STOP');
      console.log('   LOAD_MESSAGES');
      console.log('');
      console.log('✅ Server is ready!');
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

startServer();