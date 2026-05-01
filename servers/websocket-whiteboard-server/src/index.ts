// websocket-whiteboard-server/src/index.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { 
  sequelize, 
  testConnection
} from '@realtime-thesis/shared-server/config/whiteboard/database';
import { initializeAssociations } from '@realtime-thesis/shared-server/models/whiteboard';
import { WhiteboardWebSocketServer } from './services/WhiteboardWebSocketServer.js';
import { authRouter } from './routes/auth.js';
import { boardsRouter, setWebSocketServer } from './routes/board.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const WS_PORT = process.env.WS_PORT || 5002;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:6001',
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // For PNG export

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'WebSocket Whiteboard Server',
    port: PORT,
    wsPort: WS_PORT,
    uptime: process.uptime()
  });
});

// REST API Routes
app.use('/api/auth', authRouter);
app.use('/api/boards', boardsRouter);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: err.message });
});

// Start server
async function startServer() {
  try {
    console.log('🔄 Connecting to database...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    console.log('🔄 Initializing models...');
    initializeAssociations();

    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: false });
      console.log('✅ Database synced');
    }

    // Start REST API
    app.listen(PORT, () => {
      console.log('');
      console.log('╔════════════════════════════════════════════╗');
      console.log('║   🎨 WEBSOCKET WHITEBOARD SERVER         ║');
      console.log('╠════════════════════════════════════════════╣');
      console.log(`║   REST API:   http://localhost:${PORT}      ║`);
      console.log(`║   WebSocket:  ws://localhost:${WS_PORT}        ║`);
      console.log('║   Database:   PostgreSQL                   ║');
      console.log('║                                            ║');
      console.log('║   📡 Features:                            ║');
      console.log('║   ✅ Freehand drawing                     ║');
      console.log('║   ✅ Shapes (rect, circle, triangle, etc) ║');
      console.log('║   ✅ Text boxes                           ║');
      console.log('║   ✅ Sticky notes                         ║');
      console.log('║   ✅ Multi-user cursors                   ║');
      console.log('║   ✅ Undo/Redo                            ║');
      console.log('║   ✅ Export PNG                           ║');
      console.log('║   ✅ Real-time collaboration              ║');
      console.log('╚════════════════════════════════════════════╝');
      console.log('');
    });

    // Start WebSocket server
    const wsServer = new WhiteboardWebSocketServer(Number(WS_PORT));
    setWebSocketServer(wsServer);
    console.log('✅ WebSocket server ready!');

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
