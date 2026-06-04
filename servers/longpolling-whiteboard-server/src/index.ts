import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sequelize, testConnection } from '@realtime-thesis/shared-server/config/whiteboard/database';
import { initializeAssociations, User, Board, BoardMember } from '@realtime-thesis/shared-server/models/whiteboard';
import type { CanvasElement, Message } from '@realtime-thesis/shared-server/types/whiteboard/index';

dotenv.config();

const PORT = Number(process.env.PORT || 5004);
const DEFAULT_POLL_TIMEOUT = 25_000;
const MAX_POLL_TIMEOUT = 30_000;
const MAX_QUEUE_SIZE = 1000;
const PRESENCE_TTL_MS = 45_000;

interface QueuedEvent {
  id: number;
  type: string;
  payload: unknown;
  timestamp: number;
}

interface PendingPoll {
  res: Response;
  timer: ReturnType<typeof setTimeout>;
}

interface ClientState {
  user: User;
  boardId: string | null;
  queue: QueuedEvent[];
  pending?: PendingPoll;
  lastSeen: number;
}

const app = express();
const clients = new Map<string, ClientState>();
const boardHistory = new Map<string, CanvasElement[][]>();
let nextEventId = 1;

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
  touchClient(user);
  next();
}

function touchClient(user: User) {
  const existing = clients.get(user.id);
  if (existing) {
    existing.user = user;
    existing.lastSeen = Date.now();
    return existing;
  }

  const created: ClientState = {
    user,
    boardId: null,
    queue: [],
    lastSeen: Date.now(),
  };
  clients.set(user.id, created);
  return created;
}

function enqueue(client: ClientState, message: Message) {
  client.queue.push({
    id: nextEventId++,
    type: message.type,
    payload: message.payload,
    timestamp: message.timestamp,
  });

  if (client.queue.length > MAX_QUEUE_SIZE) {
    client.queue.splice(0, client.queue.length - MAX_QUEUE_SIZE);
  }

  flushPending(client);
}

function flushPending(client: ClientState) {
  if (!client.pending || client.queue.length === 0) return;

  const pending = client.pending;
  client.pending = undefined;
  clearTimeout(pending.timer);

  if (!pending.res.headersSent) {
    const events = client.queue.splice(0, client.queue.length);
    pending.res.json({ events });
  }
}

function broadcastToBoard(boardId: string, message: Message, excludeUserId?: string) {
  pruneInactiveClients();
  clients.forEach(client => {
    if (client.boardId !== boardId) return;
    if (client.user.id === excludeUserId) return;
    enqueue(client, message);
  });
}

function getActiveMembers(boardId: string) {
  const now = Date.now();
  const members: any[] = [];
  clients.forEach(client => {
    if (client.boardId !== boardId || now - client.lastSeen > PRESENCE_TTL_MS) return;
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

function pruneInactiveClients() {
  const now = Date.now();
  clients.forEach((client, userId) => {
    if (now - client.lastSeen <= PRESENCE_TTL_MS) return;

    if (client.pending) {
      clearTimeout(client.pending.timer);
      if (!client.pending.res.headersSent) client.pending.res.status(204).end();
    }

    const boardId = client.boardId;
    clients.delete(userId);
    if (boardId) {
      broadcastToBoard(boardId, {
        type: 'USER_LEFT',
        payload: {
          userId,
          username: client.user.username,
          displayName: client.user.displayName,
        },
        timestamp: Date.now(),
      });
    }
  });
}

setInterval(pruneInactiveClients, 15_000).unref();

app.get('/poll', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const client = touchClient(user);
  const timeout = Math.min(Number.parseInt(String(req.query.timeout ?? DEFAULT_POLL_TIMEOUT), 10), MAX_POLL_TIMEOUT);

  if (client.pending) {
    clearTimeout(client.pending.timer);
    if (!client.pending.res.headersSent) client.pending.res.status(204).end();
    client.pending = undefined;
  }

  if (client.queue.length > 0) {
    const events = client.queue.splice(0, client.queue.length);
    res.json({ events });
    return;
  }

  const timer = setTimeout(() => {
    if (client.pending?.res === res) client.pending = undefined;
    if (!res.headersSent) res.status(204).end();
  }, timeout);

  client.pending = { res, timer };

  req.on('close', () => {
    if (client.pending?.res !== res) return;
    clearTimeout(timer);
    client.pending = undefined;
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      cursorColor: user.cursorColor,
    },
  });
});

app.patch('/api/me/board', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  const boardId = req.body.boardId as string;
  const client = touchClient(user);
  const hasAccess = await checkBoardAccess(user.id, boardId);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied to board' });
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

  const boardState = {
    type: 'BOARD_STATE' as const,
    payload: {
      boardId,
      name: board.name,
      elements: board.elements,
      members: await getBoardMembers(boardId),
      activeMembers: getActiveMembers(boardId),
      role: membership?.role || 'viewer',
    },
    timestamp: Date.now(),
  };
  enqueue(client, boardState);

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
app.get('/health', (_req, res) => res.json({
  ok: true,
  clients: clients.size,
  pending: [...clients.values()].filter(c => c.pending).length,
  queuedEvents: [...clients.values()].reduce((sum, c) => sum + c.queue.length, 0),
}));

async function main() {
  const connected = await testConnection();
  if (!connected) process.exit(1);
  initializeAssociations();
  if (process.env.NODE_ENV === 'development') await sequelize.sync({ alter: false });

  app.listen(PORT, () => {
    console.log(`Long Polling Whiteboard Server listening on http://localhost:${PORT}`);
  });
}

process.on('SIGTERM', () => {
  clients.forEach(client => {
    if (!client.pending) return;
    clearTimeout(client.pending.timer);
    if (!client.pending.res.headersSent) client.pending.res.status(503).end();
  });
  process.exit(0);
});

main();
