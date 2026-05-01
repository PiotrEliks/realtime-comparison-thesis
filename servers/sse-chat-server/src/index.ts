import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '@realtime-thesis/shared-server/config/chat/database';
import { initializeAssociations } from '@realtime-thesis/shared-server/models/chat';
import { SSEManager } from './services/SSEManager.js';
import { authRouter } from './routes/auth.js';
import { sseRouter } from './routes/sse.js';
import { messagesRouter } from './routes/messages.js';
import { reactionsRouter } from './routes/reactions.js';
import { typingRouter } from './routes/typing.js';
import { roomsRouter } from './routes/rooms.js';
import { uploadRouter } from './routes/upload.js';
import { groupsRouter } from './routes/groups.js';
import { usersRouter } from './routes/users.js';
import '@realtime-thesis/shared-server/models/chat';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4002;

// Global SSE Manager instance
export const sseManager = new SSEManager();

// Middleware
app.use(cors({
  origin: 'http://localhost:5174', // Vite dev server for SSE client
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
const SHARED_UPLOADS_DIR = path.join(__dirname, '../../shared/uploads');
app.use('/uploads', express.static(SHARED_UPLOADS_DIR));
console.log('📁 Serving uploads from:', SHARED_UPLOADS_DIR);

// Routes
app.use('/api/auth', authRouter);
app.use('/sse', sseRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/reactions', reactionsRouter);
app.use('/api/typing', typingRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/rooms', groupsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/users', usersRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeConnections: sseManager.getActiveConnections()
  });
});

// Start server
async function start() {
  try {
    initializeAssociations();

    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Sync models
    await sequelize.sync({ alter: true });
    console.log('✅ Database synced');

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 SSE Chat Server running on http://localhost:${PORT}`);
      console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
