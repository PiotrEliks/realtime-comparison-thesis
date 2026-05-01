// servers/webrtc-server/src/routes/upload.ts

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticateToken } from '@realtime-thesis/shared-server/middleware/chat/auth';

export const uploadRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Shared uploads directory (wspólny dla wszystkich serwerów!)
const SHARED_UPLOADS_DIR = path.join(__dirname, '../../../shared/uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SHARED_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

uploadRouter.use(authenticateToken);

uploadRouter.post('/', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // WebRTC server port: 4004
    const fileUrl = `http://localhost:4004/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileMimeType: req.file.mimetype
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
