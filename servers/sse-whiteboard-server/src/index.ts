import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sequelize, testConnection } from '@realtime-thesis/shared-server/config/whiteboard/database';
import { initializeAssociations, User, Board, BoardMember } from '@realtime-thesis/shared-server/models/whiteboard';
import type { CanvasElement, Message } from '@realtime-thesis/shared-server/types/whiteboard/index';

dotenv.config();

const PORT = Number(process.env.PORT || 5003);

interface SseClient {
  id: string;
  res: Response;
  user: User;
  boardId: string | null;
}

const app = express();
const clients = new Map<string, SseClient>();
const boardHistory = new Map<string, CanvasElement[][]>();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' }));

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  const token = header.slice(7);
  if (!isUuid(token)) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  const user = await User.findByPk(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  (req as any).user = user;
  next();
}

function send(client: SseClient, message: Message) {
  client.res.write(`event: ${message.type}\ndata: ${JSON.stringify(message)}\n\n`);
}

function sendEvent(res: Response, message: Message) {
  res.write(`event: ${message.type}\ndata: ${JSON.stringify(message)}\n\n`);
}

function broadcastToBoard(boardId: string, message: Message, excludeUserId?: string) {
  const dead: string[] = [];
  clients.forEach(client => {
    if (client.boardId !== boardId) return;
    if (client.user.id === excludeUserId) return;
    try { send(client, message); } catch { dead.push(client.id); }
  });
  dead.forEach(id => clients.delete(id));
}

function getActiveMembers(boardId: string) {
  const members: any[] = [];
  clients.forEach(client => {
    if (client.boardId !== boardId) return;
    members.push({
      userId: client.user.id,
      username: client.user.username,
      displayName: client.user.displayName,
      cursorColor: client.user.cursorColor,
    });
  });
  return members;
}

async function checkBoardAccess(userId: string, boardId: string) {
  return Boolean(await BoardMember.findOne({ where: { userId, boardId } }));
}

async function getBoardMembers(boardId: string) {
  const members = await BoardMember.findAll({
    where: { boardId },
    include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'cursorColor'] }],
  });
  return members.map(member => ({
    ...((member as any).user?.toJSON?.() || {}),
    role: member.role,
    joinedAt: member.joinedAt,
  }));
}

function saveToHistory(boardId: string, elements: CanvasElement[]) {
  if (!boardHistory.has(boardId)) boardHistory.set(boardId, []);
  const history = boardHistory.get(boardId)!;
  if (history.length >= 50) history.shift();
  history.push(JSON.parse(JSON.stringify(elements)));
}

function getElementId(element: CanvasElement) {
  return element.data.id;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

app.get('/events', async (req: Request, res: Response) => {
  const token = String(req.query.token ?? '');
  if (!isUuid(token)) {
    res.status(401).end();
    return;
  }
  const user = await User.findByPk(token);
  if (!user) {
    res.status(401).end();
    return;
  }

  const id = crypto.randomUUID().slice(0, 8);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client: SseClient = { id, res, user, boardId: null };
  clients.set(id, client);
  send(client, {
    type: 'CONNECTED',
    payload: {
      userId: user.id,
      username: user.username,
      cursorColor: user.cursorColor,
    },
    timestamp: Date.now(),
  });

  const keepAlive = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch { clearInterval(keepAlive); }
  }, 15_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(id);
    if (client.boardId) {
      broadcastToBoard(client.boardId, {
        type: 'USER_LEFT',
        payload: {
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
        },
        timestamp: Date.now(),
      });
    }
  });
});

app.patch('/api/me/board', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  const boardId = req.body.boardId as string;
  const hasAccess = await checkBoardAccess(user.id, boardId);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied to board' });
    return;
  }

  const client = [...clients.values()].find(c => c.user.id === user.id);
  if (!client) {
    res.status(404).json({ error: 'No active SSE stream for this user' });
    return;
  }

  client.boardId = boardId;
  if (!boardHistory.has(boardId)) boardHistory.set(boardId, []);
  const board = await Board.findByPk(boardId);
  const membership = await BoardMember.findOne({ where: { boardId, userId: user.id } });
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }

  send(client, {
    type: 'BOARD_STATE',
    payload: {
      boardId,
      name: board.name,
      elements: board.elements,
      members: await getBoardMembers(boardId),
      activeMembers: getActiveMembers(boardId),
      role: membership?.role || 'viewer',
    },
    timestamp: Date.now(),
  });

  broadcastToBoard(boardId, {
    type: 'USER_JOINED',
    payload: {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      cursorColor: user.cursorColor,
      role: membership?.role || 'viewer',
    },
    timestamp: Date.now(),
  }, user.id);

  res.json({ ok: true });
});

app.post('/api/cursor', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  const { boardId, x, y, tool } = req.body;
  broadcastToBoard(boardId, {
    type: 'CURSOR_MOVE',
    payload: {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      color: user.cursorColor || '#FF6B6B',
      x,
      y,
      tool,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  }, user.id);
  res.json({ ok: true });
});

app.post('/api/draw-end', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  const { boardId, element } = req.body as { boardId: string; element: CanvasElement };
  const board = await Board.findByPk(boardId);
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }
  const elements = [...board.elements, element];
  saveToHistory(boardId, elements);
  await board.update({ elements });
  broadcastToBoard(boardId, {
    type: 'DRAW_END',
    payload: { boardId, element },
    timestamp: Date.now(),
  }, user.id);
  res.json({ ok: true });
});

app.post('/api/elements', requireAuth, async (req, res) => {
  const { boardId, element } = req.body as { boardId: string; element: CanvasElement };
  const board = await Board.findByPk(boardId);
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }
  const elements = [...board.elements, element];
  saveToHistory(boardId, elements);
  await board.update({ elements });
  broadcastToBoard(boardId, {
    type: 'ELEMENT_ADD',
    payload: element,
    timestamp: Date.now(),
  });
  res.json({ ok: true, element });
});

app.patch('/api/elements/:id', requireAuth, async (req, res) => {
  const { boardId, changes } = req.body;
  const board = await Board.findByPk(boardId);
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }
  const elements = board.elements.map(element => getElementId(element) === req.params.id ? { ...element, ...changes } : element);
  saveToHistory(boardId, elements);
  await board.update({ elements });
  broadcastToBoard(boardId, {
    type: 'ELEMENT_UPDATE',
    payload: { elementId: req.params.id, changes },
    timestamp: Date.now(),
  });
  res.json({ ok: true });
});

app.delete('/api/elements/:id', requireAuth, async (req, res) => {
  const { boardId } = req.body;
  const board = await Board.findByPk(boardId);
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }
  const elements = board.elements.filter(element => getElementId(element) !== req.params.id);
  saveToHistory(boardId, elements);
  await board.update({ elements });
  broadcastToBoard(boardId, {
    type: 'ELEMENT_DELETE',
    payload: { elementId: req.params.id },
    timestamp: Date.now(),
  });
  res.json({ ok: true });
});

app.delete('/api/board/clear', requireAuth, async (req, res) => {
  const { boardId } = req.body;
  const board = await Board.findByPk(boardId);
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }
  saveToHistory(boardId, []);
  await board.update({ elements: [] });
  broadcastToBoard(boardId, { type: 'CLEAR_BOARD', payload: {}, timestamp: Date.now() });
  res.json({ ok: true });
});

app.get('/ping', (_req, res) => res.json({ pong: true, serverTime: Date.now() }));
app.get('/health', (_req, res) => res.json({ ok: true, clients: clients.size }));

async function main() {
  const connected = await testConnection();
  if (!connected) process.exit(1);
  initializeAssociations();
  if (process.env.NODE_ENV === 'development') await sequelize.sync({ alter: false });

  app.listen(PORT, () => {
    console.log(`SSE Whiteboard Server listening on http://localhost:${PORT}`);
  });
}

process.on('SIGTERM', () => process.exit(0));

main();
