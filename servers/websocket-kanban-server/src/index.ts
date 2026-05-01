import express    from 'express';
import cors       from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { testConnection }  from '@realtime-thesis/shared-server/config/kanban/database';
import { KanbanManager }   from './websocket/KanbanManager';
import { AuthService }     from '@realtime-thesis/shared-server/services/kanban/AuthService';
import '@realtime-thesis/shared-server/models/kanban/index';   // register associations

const PORT = 4010;

const app  = express();
app.use(cors());
app.use(express.json());

const auth = new AuthService();

// ─── REST: Auth (login/register) ─────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await auth.login(username, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    const result = await auth.register(username, email, password, displayName);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ...mgr.stats() });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
const http = createServer(app);
const wss  = new WebSocketServer({ server: http });
let mgr: KanbanManager;

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  const connected = await testConnection();
  if (!connected) { console.error('Cannot connect to DB'); process.exit(1); }

  mgr = new KanbanManager(wss);

  http.listen(PORT, () => {
    console.log('');
    console.log('  ╭──────────────────────────────────────────────╮');
    console.log('  │  WebSocket Kanban Server                     │');
    console.log(`  │  HTTP  →  http://localhost:${PORT}               │`);
    console.log(`  │  WS    →  ws://localhost:${PORT}                 │`);
    console.log(`  │  Login →  POST /api/auth/login               │`);
    console.log('  ╰──────────────────────────────────────────────╯');
    console.log('');
  });
}

main();