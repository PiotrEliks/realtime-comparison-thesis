import express, { Request, Response } from 'express';
import cors from 'cors';
import { DataSimulator } from '@realtime-thesis/shared-server/simulator';
import type { DashboardSnapshot, SimulationEvent } from '@realtime-thesis/shared-ui';

const PORT            = 4007;
const DEFAULT_TIMEOUT = 10_000;   // ms – klient czeka max 10s
const MAX_HISTORY     = 300;      // ostatnie N snapshotów w buforze

// ─── Snapshot buffer ──────────────────────────────────────────────────────────
// Trzymamy historię żeby klient który się reconnectuje dostał najnowszy snapshot
// zamiast czekać na następny tick symulatora.
const snapshots: DashboardSnapshot[] = [];

// ─── Pending clients ──────────────────────────────────────────────────────────
// Każdy oczekujący request long-poll jest tutaj zarejestrowany.
interface PendingClient {
  id:      string;
  res:     Response;
  since:   number;    // sequenceId od którego klient czeka
  timer:   ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingClient>();

function resolveClient(client: PendingClient, snap: DashboardSnapshot) {
  clearTimeout(client.timer);
  pending.delete(client.id);
  if (!client.res.headersSent) {
    client.res.json({ snapshot: snap, config: sim.getConfig() });
  }
}

function resolveAll(snap: DashboardSnapshot) {
  pending.forEach(client => {
    // Oddaj tylko jeśli snap jest nowszy niż to czego klient oczekuje
    if (snap.sequenceId > client.since) {
      resolveClient(client, snap);
    }
  });
}

// ─── Simulator ────────────────────────────────────────────────────────────────
const sim = new DataSimulator({ intervalMs: 1000 });
// Uwaga: LP ma wyższy default intervalMs (1000ms) – każdy snapshot to oddzielny
// HTTP round-trip, więc 250ms byłoby zbyt agresywne dla serwera.

sim.on('snapshot', (snap: DashboardSnapshot) => {
  snapshots.push(snap);
  if (snapshots.length > MAX_HISTORY) snapshots.shift();
  resolveAll(snap);
});

sim.on('configChanged', () => {
  // Przy zmianie interwału: nie ma co broadcastować (klienci dowiedzą się przy następnym pollu)
});

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// ─── GET /poll — Long Polling endpoint ────────────────────────────────────────
//
// Query params:
//   since   (number) – ostatni znany sequenceId klienta; 0 = "daj mi najnowszy"
//   timeout (number) – max ms czekania; domyślnie DEFAULT_TIMEOUT
//
// Responses:
//   200 { snapshot, config }  – nowy snapshot dostępny
//   204                       – timeout, brak nowych danych (klient powtarza request)

app.get('/poll', (req: Request, res: Response) => {
  const since   = parseInt(String(req.query.since   ?? '0'), 10);
  const timeout = Math.min(parseInt(String(req.query.timeout ?? String(DEFAULT_TIMEOUT)), 10), 30_000);
  const id      = crypto.randomUUID().slice(0, 8);

  // Jeżeli jest już nowszy snapshot w buforze – odpowiedz natychmiast (fast path)
  const fresh = snapshots.findLast(s => s.sequenceId > since);
  if (fresh) {
    res.json({ snapshot: fresh, config: sim.getConfig() });
    return;
  }

  // Slow path: zarejestruj oczekującego klienta
  const timer = setTimeout(() => {
    pending.delete(id);
    if (!res.headersSent) res.status(204).end();
  }, timeout);

  const client: PendingClient = { id, res, since, timer };
  pending.set(id, client);

  // Cleanup jeśli klient się rozłączy przed timeout
  req.on('close', () => {
    clearTimeout(timer);
    pending.delete(id);
  });
});

// ─── GET /snapshot — "daj mi teraz najnowszy snapshot" (initial load) ─────────
// Używany przez adapter przy pierwszym połączeniu zamiast czekać na pierwszy poll.
app.get('/snapshot', (_req, res) => {
  if (snapshots.length === 0) return res.status(503).json({ error: 'no data yet' });
  res.json({ snapshot: snapshots[snapshots.length - 1], config: sim.getConfig() });
});

// ─── GET /config ──────────────────────────────────────────────────────────────
app.get('/config', (_req, res) => res.json(sim.getConfig()));

// ─── GET /ping — RTT measurement ─────────────────────────────────────────────
app.get('/ping', (_req, res) => res.json({ pong: true, serverTime: Date.now() }));

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  ok:       true,
  pending:  pending.size,
  buffered: snapshots.length,
  config:   sim.getConfig(),
}));

// ─── POST /api/event ──────────────────────────────────────────────────────────
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

// ─── POST /api/interval ───────────────────────────────────────────────────────
app.post('/api/interval', (req, res) => {
  const ms = Number(req.body.ms);
  if (!ms || ms < 100 || ms > 30_000)
    return res.status(400).json({ error: 'ms must be 100–30000' });
  sim.updateConfig({ intervalMs: ms });
  res.json({ ok: true, intervalMs: ms });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ╭──────────────────────────────────────────────────────╮');
  console.log('  │  Long Polling Dashboard Server                       │');
  console.log(`  │  Poll     →  http://localhost:${PORT}/poll               │`);
  console.log(`  │  Snapshot →  http://localhost:${PORT}/snapshot           │`);
  console.log(`  │  Health   →  http://localhost:${PORT}/health             │`);
  console.log('  ╰──────────────────────────────────────────────────────╯');
  console.log('');
  sim.start();
});

process.on('SIGTERM', () => {
  sim.stop();
  // Rozwiąż wszystkich oczekujących z ostatnim snapshotem lub 503
  pending.forEach(c => {
    clearTimeout(c.timer);
    if (!c.res.headersSent) c.res.status(503).end();
  });
  process.exit(0);
});