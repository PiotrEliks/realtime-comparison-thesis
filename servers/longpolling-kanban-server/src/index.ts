import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { testConnection } from '@realtime-thesis/shared-server/config/kanban/database';
import { AuthService } from '@realtime-thesis/shared-server/services/kanban/AuthService';
import { TaskService } from '@realtime-thesis/shared-server/services/kanban/TaskService';
import '@realtime-thesis/shared-server/models/kanban/index';
import type { User } from '@realtime-thesis/shared-server/models/kanban/User';

const PORT = Number(process.env.PORT || 4012);
const DEFAULT_POLL_TIMEOUT = 25_000;
const MAX_POLL_TIMEOUT = 30_000;
const MAX_QUEUE_SIZE = 500;
const PRESENCE_TTL_MS = 45_000;

interface QueuedEvent {
  id: number;
  event: string;
  data: unknown;
  createdAt: number;
}

interface PendingPoll {
  res: Response;
  timer: ReturnType<typeof setTimeout>;
}

interface ClientState {
  user: User;
  projectId: string | null;
  queue: QueuedEvent[];
  pending?: PendingPoll;
  lastSeen: number;
}

const app = express();
const authService = new AuthService();
const taskService = new TaskService();
const clients = new Map<string, ClientState>();
let nextEventId = 1;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const user = await authService.getUserFromToken(header.slice(7));
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
    projectId: null,
    queue: [],
    lastSeen: Date.now(),
  };
  clients.set(user.id, created);
  return created;
}

function enqueue(client: ClientState, event: string, data: unknown) {
  client.queue.push({
    id: nextEventId++,
    event,
    data,
    createdAt: Date.now(),
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
    pending.res.json({
      events,
      activeUsers: client.projectId ? getActiveUsers(client.projectId) : [],
    });
  }
}

function broadcast(projectId: string, event: string, data: unknown, excludeUserId?: string) {
  pruneInactiveClients();
  broadcastWithoutPrune(projectId, event, data, excludeUserId);
}

function broadcastWithoutPrune(projectId: string, event: string, data: unknown, excludeUserId?: string) {
  clients.forEach(client => {
    if (client.projectId !== projectId) return;
    if (client.user.id === excludeUserId) return;
    enqueue(client, event, data);
  });
}

function getActiveUsers(projectId: string): string[] {
  const now = Date.now();
  const ids: string[] = [];
  clients.forEach(client => {
    if (client.projectId === projectId && now - client.lastSeen <= PRESENCE_TTL_MS) {
      ids.push(client.user.id);
    }
  });
  return [...new Set(ids)];
}

function pruneInactiveClients() {
  const now = Date.now();
  clients.forEach((client, userId) => {
    if (now - client.lastSeen <= PRESENCE_TTL_MS) return;

    if (client.pending) {
      clearTimeout(client.pending.timer);
      if (!client.pending.res.headersSent) client.pending.res.status(204).end();
    }

    const projectId = client.projectId;
    clients.delete(userId);
    if (projectId) {
      broadcastWithoutPrune(projectId, 'user_left', {
        userId,
        activeUsers: getActiveUsers(projectId),
      });
    }
  });
}

setInterval(pruneInactiveClients, 15_000).unref();

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await authService.login(req.body.username, req.body.password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    res.json(await authService.register(username, email, password, displayName));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/poll', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const client = touchClient(user);
  const timeout = Math.min(
    Number.parseInt(String(req.query.timeout ?? DEFAULT_POLL_TIMEOUT), 10),
    MAX_POLL_TIMEOUT,
  );

  if (client.pending) {
    clearTimeout(client.pending.timer);
    if (!client.pending.res.headersSent) client.pending.res.status(204).end();
    client.pending = undefined;
  }

  if (client.queue.length > 0) {
    const events = client.queue.splice(0, client.queue.length);
    res.json({
      events,
      activeUsers: client.projectId ? getActiveUsers(client.projectId) : [],
    });
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

app.patch('/api/me/project', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const projectId = req.body.projectId as string;
  const client = touchClient(user);
  client.projectId = projectId;

  const [taskList, members] = await Promise.all([
    taskService.getProjectTasks(projectId),
    taskService.getProjectMembers(projectId),
  ]);

  broadcast(projectId, 'user_joined', {
    userId: user.id,
    username: user.username,
    activeUsers: getActiveUsers(projectId),
  }, user.id);

  res.json({
    tasks: taskList.map(t => t.toJSON()),
    members,
    activeUsers: getActiveUsers(projectId),
  });
});

app.get('/api/projects', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  res.json(await taskService.getUserProjects(user.id));
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  res.json({
    user: user.toPublic(),
    projects: await taskService.getUserProjects(user.id),
  });
});

app.post('/api/tasks', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { projectId, ...data } = req.body;
  try {
    const task = await taskService.createTask(projectId, user.id, data);
    broadcast(projectId, 'task_created', { task: task?.toJSON() });
    res.json(task?.toJSON());
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/tasks/:id', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { projectId, ...changes } = req.body;
  try {
    const task = await taskService.updateTask(req.params.id, user.id, changes);
    broadcast(projectId, 'task_updated', { task: task?.toJSON() });
    res.json(task?.toJSON());
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/move', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { projectId, newStatus, position } = req.body;
  try {
    const task = await taskService.moveTask(req.params.id, user.id, newStatus, position);
    broadcast(projectId, 'task_moved', {
      task: task?.toJSON(),
      taskId: req.params.id,
      newStatus,
    });
    res.json(task?.toJSON());
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', requireAuth, async (req: Request, res: Response) => {
  const { projectId } = req.body;
  try {
    await taskService.deleteTask(req.params.id);
    broadcast(projectId, 'task_deleted', { taskId: req.params.id });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/tasks/:id/detail', requireAuth, async (req, res) => {
  const [comments, history] = await Promise.all([
    taskService.getComments(req.params.id),
    taskService.getHistory(req.params.id),
  ]);
  res.json({
    comments: comments.map(c => c.toJSON()),
    history: history.map(h => h.toJSON()),
  });
});

app.post('/api/tasks/:id/comments', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { projectId, content } = req.body;
  try {
    const comment = await taskService.addComment(req.params.id, user.id, content);
    broadcast(projectId, 'comment_added', {
      taskId: req.params.id,
      comment: comment?.toJSON(),
    });
    res.json(comment?.toJSON());
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
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
  if (!connected) {
    console.error('Cannot connect to DB');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('Long Polling Kanban Server');
    console.log(`  Poll   -> http://localhost:${PORT}/poll`);
    console.log(`  API    -> http://localhost:${PORT}/api/...`);
    console.log(`  Health -> http://localhost:${PORT}/health`);
    console.log('');
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
