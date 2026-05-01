// servers/longpolling-server/src/routes/poll.ts

import { Router } from 'express';
import { longPollingManager } from '../index.js';
import { AuthService } from '@realtime-thesis/shared-server/services/chat/AuthService';
import { RoomService } from '../services/RoomService.js';

export const pollRouter = Router();
const authService = new AuthService();
const roomService = new RoomService();

/**
 * GET /api/poll?token=xxx&lastEventId=0
 * 
 * Long Polling endpoint - czeka na nowe eventy (lub timeout 30s)
 */
pollRouter.get('/', async (req, res) => {
  try {
    const token = req.query.token as string;
    const lastEventId = parseInt(req.query.lastEventId as string) || 0;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Weryfikuj token
    const user = await authService.getUserFromToken(token);
    if (!user) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Przy pierwszym połączeniu (lastEventId = 0), zarejestruj użytkownika
    if (lastEventId === 0) {
      const userRooms = await roomService.getUserRooms(user.id);
      const roomIds = userRooms.map(r => r.id);
      
      longPollingManager.registerUser(user.id, user, roomIds);
      
      await user.update({ status: 'online', lastSeen: new Date() });

      // Wyślij początkowy event CONNECTED
      longPollingManager.addEventToUser(user.id, 'CONNECTED', {
        user: user.toJSON(),
        rooms: userRooms
      });

      // Broadcast status change
      roomIds.forEach(roomId => {
        longPollingManager.broadcastToRoom(roomId, 'USER_STATUS_CHANGE', {
          userId: user.id,
          status: 'online'
        }, user.id);
      });
    }

    // Long poll - czekaj na nowe eventy
    const events = await longPollingManager.waitForEvents(user.id, lastEventId);

    // Odpowiedź z eventami
    res.json({
      events,
      lastEventId: events.length > 0 ? events[events.length - 1].id : lastEventId,
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('❌ Poll error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/poll/heartbeat
 * 
 * Keepalive endpoint - informuje że użytkownik jest aktywny
 */
pollRouter.post('/heartbeat', async (req, res) => {
  try {
    const token = req.body.token || req.query.token;
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const user = await authService.getUserFromToken(token);
    if (!user) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Aktualizuj lastSeen
    await user.update({ lastSeen: new Date() });

    res.json({ 
      success: true,
      activeSessions: longPollingManager.getActiveSessionsCount()
    });

  } catch (error: any) {
    console.error('❌ Heartbeat error:', error);
    res.status(500).json({ error: error.message });
  }
});
