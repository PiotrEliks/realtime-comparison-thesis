import express from 'express';
import { AuthController } from '../controllers/AuthController.js';
import { RoomController } from '../controllers/RoomController.js';
import { UserController } from '../controllers/UserController.js'; // ← DODAJ
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

export const router = express.Router();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_UPLOADS_DIR = path.join(__dirname, '../../../shared/uploads');

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory:', uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SHARED_UPLOADS_DIR); // Użyj absolute path
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'));
    }
  }
});

const authController = new AuthController();
const roomController = new RoomController();
const userController = new UserController(); // ← DODAJ

// Auth routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/logout', authenticateToken, authController.logout);
router.get('/auth/me', authenticateToken, authController.getMe);

// User routes  ← DODAJ TE
router.get('/users/search', authenticateToken, userController.searchUsers);
router.get('/users', authenticateToken, userController.getAllUsers);

// Room routes
router.get('/rooms', authenticateToken, roomController.getUserRooms);
router.post('/rooms/private', authenticateToken, roomController.createPrivateRoom);
router.post('/rooms/group', authenticateToken, roomController.createGroupRoom);
router.get('/rooms/:roomId/messages', authenticateToken, roomController.getRoomMessages);
router.post('/rooms/:roomId/members', authenticateToken, roomController.addMember);

router.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('✅ File uploaded:', req.file.filename);

    // Zwróć pełny URL
    const fileUrl = `http://localhost:4001/uploads/${req.file.filename}`;
    
    res.json({
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
