import express, { Request, Response, NextFunction } from 'express';
import cors    from 'cors';
import { testConnection } from '@realtime-thesis/shared-server/config/kanban/database';
import { AuthService }    from '@realtime-thesis/shared-server/services/kanban/AuthService';
import { TaskService }    from '@realtime-thesis/shared-server/services/kanban/TaskService';
import '@realtime-thesis/shared-server/models/kanban/index'; 
import type { User } from '@realtime-thesis/shared-server/models/kanban/User';

const PORT = 4011;

// ─── SSE client registry ──────────────────────────────────────────────────────
//
// Kluczowa różnica vs WebSocket:
//   - EventSource otwiera jedno połączenie HTTP (serwer → klient)
//   - Wszystkie akcje klienta (create/move/etc.) idą przez osobne POST requesty
//   - Token przekazywany w query string bo EventSource nie obsługuje headers
//
interface SSEClient {
  id:        string;
  res:       Response;
  user:      User;
  projectId: string | null;
}

const clients = new Map<string, SSEClient>();

function broadcast(projectId: string, event: string, data: unknown, excludeId?: string) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const dead: string[] = [];
  clients.forEach(c => {
    if (c.projectId !== projectId) return;
    if (c.id === excludeId)        return;
    try { c.res.write(payload); }
    catch { dead.push(c.id); }
  });
  dead.forEach(id => clients.delete(id));
}

function getActiveUsers(projectId: string): string[] {
  const ids: string[] = [];
  clients.forEach(c => { if (c.projectId === projectId) ids.push(c.user.id); });
  return [...new Set(ids)];
}

function sendToUser(userId: string, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => {
    if (c.user.id === userId) {
      try { c.res.write(payload); } catch { /* ignore */ }
    }
  });
}

// ─── Services ─────────────────────────────────────────────────────────────────
const authService  = new AuthService();
const taskService  = new TaskService();

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// ─── Auth middleware ──────────────────────────────────────────────────────────
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
  next();
}

// ─── GET /events — SSE stream ─────────────────────────────────────────────────
app.get('/events', async (req: Request, res: Response) => {
  const token = String(req.query.token ?? '');
  const user  = await authService.getUserFromToken(token);
  if (!user) { res.status(401).end(); return; }

  const id = crypto.randomUUID().slice(0, 8);

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache, no-transform');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  clients.set(id, { id, res, user, projectId: null });
  console.log(`✅ [${id}] ${user.username} connected  (${clients.size} total)`);

  // Send initial data: clientId + user + projects
  const userProjects = await taskService.getUserProjects(user.id);
  res.write(`event: connected\ndata: ${JSON.stringify({
    clientId: id,
    user:     user.toPublic(),
    projects: userProjects,
  })}\n\n`);

  // Keep-alive comment every 15s
  const keepAlive = setInterval(() => {
    try { res.write(': keep-alive\n\n'); }
    catch { clearInterval(keepAlive); }
  }, 15_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const c = clients.get(id);
    clients.delete(id);
    if (c?.projectId) {
      broadcast(c.projectId, 'user_left', {
        userId:      user.id,
        activeUsers: getActiveUsers(c.projectId),
      });
    }
    console.log(`❌ [${id}] ${user.username} disconnected  (${clients.size} remaining)`);
  });
});

// ─── PATCH /api/me/project — subscribe to a project ──────────────────────────
// Klient wywołuje gdy użytkownik wybiera projekt.
// Odpowiedź SSE (project_loaded) wraca przez otwarty stream, nie przez HTTP.
app.patch('/api/me/project', requireAuth, async (req: Request, res: Response) => {
  const user      = (req as any).user as User;
  const projectId = req.body.projectId as string;

  // Find this user's SSE client
  let clientId: string | null = null;
  clients.forEach(c => { if (c.user.id === user.id) clientId = c.id; });

  if (!clientId) {
    res.status(404).json({ error: 'No active SSE stream for this user — open /events first' });
    return;
  }

  const client = clients.get(clientId)!;
  client.projectId = projectId;

  const [taskList, members] = await Promise.all([
    taskService.getProjectTasks(projectId),
    taskService.getProjectMembers(projectId),
  ]);

  // Send project data to this client via SSE stream
  client.res.write(`event: project_loaded\ndata: ${JSON.stringify({
    tasks:       taskList.map(t => t.toJSON()),
    members,
    activeUsers: getActiveUsers(projectId),
  })}\n\n`);

  // Notify others
  broadcast(projectId, 'user_joined', {
    userId:      user.id,
    username:    user.username,
    activeUsers: getActiveUsers(projectId),
  }, clientId);

  res.json({ ok: true });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await authService.login(req.body.username, req.body.password);
    res.json(result);
  } catch (err: any) { res.status(401).json({ error: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    res.json(await authService.register(username, email, password, displayName));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ─── Projects ─────────────────────────────────────────────────────────────────
app.get('/api/projects', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  res.json(await taskService.getUserProjects(user.id));
});

// ─── Tasks: CRUD ──────────────────────────────────────────────────────────────
app.post('/api/tasks', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { projectId, ...data } = req.body;
  try {
    const task = await taskService.createTask(projectId, user.id, data);
    broadcast(projectId, 'task_created', { task: task?.toJSON() });
    res.json(task?.toJSON());
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/tasks/:id', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { projectId, ...changes } = req.body;
  try {
    const task = await taskService.updateTask(req.params.id, user.id, changes);
    broadcast(projectId, 'task_updated', { task: task?.toJSON() });
    res.json(task?.toJSON());
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post('/api/tasks/:id/move', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { projectId, newStatus, position } = req.body;
  try {
    const task = await taskService.moveTask(req.params.id, user.id, newStatus, position);
    broadcast(projectId, 'task_moved', {
      task:      task?.toJSON(),
      taskId:    req.params.id,
      newStatus,
    });
    res.json(task?.toJSON());
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/tasks/:id', requireAuth, async (req: Request, res: Response) => {
  const { projectId } = req.body;
  try {
    await taskService.deleteTask(req.params.id);
    broadcast(projectId, 'task_deleted', { taskId: req.params.id });
    res.json({ ok: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ─── Task detail ──────────────────────────────────────────────────────────────
app.get('/api/tasks/:id/detail', requireAuth, async (req, res) => {
  const [comments, history] = await Promise.all([
    taskService.getComments(req.params.id),
    taskService.getHistory(req.params.id),
  ]);
  res.json({
    comments: comments.map(c => c.toJSON()),
    history:  history.map(h => h.toJSON()),
  });
});

app.post('/api/tasks/:id/comments', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { projectId, content } = req.body;
  try {
    const comment = await taskService.addComment(req.params.id, user.id, content);
    broadcast(projectId, 'comment_added', {
      taskId:  req.params.id,
      comment: comment?.toJSON(),
    });
    res.json(comment?.toJSON());
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ─── Utility ──────────────────────────────────────────────────────────────────
app.get('/ping',   (_req, res) => res.json({ pong: true, serverTime: Date.now() }));
app.get('/health', (_req, res) => res.json({ ok: true, clients: clients.size }));

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  const connected = await testConnection();
  if (!connected) { console.error('Cannot connect to DB'); process.exit(1); }

  app.listen(PORT, () => {
    console.log('');
    console.log('  ╭────────────────────────────────────────────────────╮');
    console.log('  │  SSE Kanban Server                                 │');
    console.log(`  │  Stream  →  http://localhost:${PORT}/events?token=...  │`);
    console.log(`  │  API     →  http://localhost:${PORT}/api/...            │`);
    console.log(`  │  Health  →  http://localhost:${PORT}/health             │`);
    console.log('  ╰────────────────────────────────────────────────────╯');
    console.log('');
    console.log('  SSE: server→client via EventSource');
    console.log('  REST: client→server via HTTP POST/PATCH/DELETE');
    console.log('');
  });
}

main();