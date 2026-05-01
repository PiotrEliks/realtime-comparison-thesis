import express, { Request, Response } from 'express';
import cors from 'cors';
import { DataSimulator } from '@realtime-thesis/shared-server/simulator';
import type { DashboardSnapshot, SimulationEvent } from '@realtime-thesis/shared-ui';

const PORT = 4006;

// ─── SSE client registry ──────────────────────────────────────────────────────

interface SSEClient {
  id:           string;
  res:          Response;
  connectedAt:  number;
}

const clients = new Map<string, SSEClient>();

function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const dead: string[] = [];
  clients.forEach(c => {
    try { c.res.write(payload); }
    catch { dead.push(c.id); }
  });
  dead.forEach(id => { clients.delete(id); console.log(`🗑  [${id}] pruned`); });
}

// ─── Simulator ────────────────────────────────────────────────────────────────

const sim = new DataSimulator({ intervalMs: 250 });

sim.on('snapshot', (snap: DashboardSnapshot) => broadcast('snapshot', snap));
sim.on('configChanged', (cfg: unknown)       => broadcast('config',   cfg));

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Cache-Control', 'Accept'],
}));
app.use(express.json());

// ─── GET /stream — SSE connection ─────────────────────────────────────────────
//
// Protocol:
//   event: config   → SimulatorConfig  (on connect)
//   event: snapshot → DashboardSnapshot (every intervalMs)
//   : keep-alive    → comment every 15s  (prevents proxy timeouts)

app.get('/stream', (req: Request, res: Response) => {
  const id = crypto.randomUUID().slice(0, 8);

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache, no-transform');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');   // nginx: disable buffering
  res.flushHeaders();

  // ① Send config so client knows current intervalMs immediately
  res.write(`event: config\ndata: ${JSON.stringify(sim.getConfig())}\n\n`);

  // ② Keep-alive comment every 15s
  const keepAlive = setInterval(() => {
    try { res.write(': keep-alive\n\n'); }
    catch { clearInterval(keepAlive); }
  }, 15_000);

  clients.set(id, { id, res, connectedAt: Date.now() });
  console.log(`✅ [${id}] SSE connected  (${clients.size} clients)`);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(id);
    console.log(`❌ [${id}] disconnected  (${clients.size} remaining)`);
  });
});

// ─── GET /ping — RTT measurement ──────────────────────────────────────────────
// Client timestamps before fetch, measures elapsed after response.

app.get('/ping', (_req, res) => {
  res.json({ pong: true, serverTime: Date.now() });
});

// ─── GET /health ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, clients: clients.size, config: sim.getConfig() });
});

// ─── POST /api/event — inject simulation event ────────────────────────────────

const VALID_EVENTS: SimulationEvent[] = [
  'CPU_SPIKE', 'MEMORY_LEAK', 'NETWORK_OUTAGE',
  'STOCK_CRASH', 'IOT_SENSOR_OFFLINE', 'DDOS_SIMULATION',
];

app.post('/api/event', (req, res) => {
  const { event } = req.body as { event: SimulationEvent };
  if (!VALID_EVENTS.includes(event))
    return res.status(400).json({ error: 'unknown event', valid: VALID_EVENTS });
  sim.injectEvent(event);
  res.json({ ok: true, event });
});

// ─── POST /api/interval — change update frequency ────────────────────────────

app.post('/api/interval', (req, res) => {
  const ms = Number(req.body.ms);
  if (!ms || ms < 100 || ms > 10_000)
    return res.status(400).json({ error: 'ms must be 100–10000' });
  sim.updateConfig({ intervalMs: ms });
  // configChanged event → broadcast('config', ...) fires automatically
  res.json({ ok: true, intervalMs: ms });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('  ╭─────────────────────────────────────────────────╮');
  console.log('  │  SSE Dashboard Server                           │');
  console.log(`  │  Stream  →  http://localhost:${PORT}/stream         │`);
  console.log(`  │  Ping    →  http://localhost:${PORT}/ping           │`);
  console.log(`  │  Health  →  http://localhost:${PORT}/health         │`);
  console.log('  ╰─────────────────────────────────────────────────╯');
  console.log('');
  sim.start();
});

process.on('SIGTERM', () => {
  sim.stop();
  clients.forEach(c => c.res.end());
  process.exit(0);
});