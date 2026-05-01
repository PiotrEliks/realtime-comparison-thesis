import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { DataSimulator } from "@realtime-thesis/shared-server/simulator";
import { DashboardManager } from '../websocket/DashboardManager';

const PORT = 4005;

// ============================================================
// EXPRESS — HTTP server + healthcheck
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// ============================================================
// SIMULATOR + DASHBOARD MANAGER
// ============================================================
const simulator = new DataSimulator({ intervalMs: 250, enableAlerts: true });
const wss = new WebSocketServer({ server: httpServer });
const dashboardManager = new DashboardManager(wss, simulator);

// ============================================================
// REST ENDPOINTS — kontrola symulatora
// ============================================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    ...dashboardManager.getStats(),
  });
});

app.post('/api/event', (req, res) => {
  const { event } = req.body;
  const valid = ['CPU_SPIKE', 'MEMORY_LEAK', 'NETWORK_OUTAGE', 'STOCK_CRASH', 'IOT_SENSOR_OFFLINE', 'DDOS_SIMULATION'];
  if (!valid.includes(event)) {
    return res.status(400).json({ error: 'Unknown event', valid });
  }
  simulator.injectEvent(event);
  res.json({ ok: true, event });
});

app.post('/api/interval', (req, res) => {
  const { ms } = req.body;
  if (typeof ms !== 'number' || ms < 100 || ms > 10000) {
    return res.status(400).json({ error: 'ms must be 100-10000' });
  }
  simulator.updateConfig({ intervalMs: ms });
  res.json({ ok: true, intervalMs: ms });
});

// ============================================================
// START
// ============================================================
httpServer.listen(PORT, () => {
  console.log('');
  console.log('🚀 ╔══════════════════════════════════════╗');
  console.log('   ║  WebSocket Dashboard Server          ║');
  console.log(`   ║  HTTP:  http://localhost:${PORT}       ║`);
  console.log(`   ║  WS:    ws://localhost:${PORT}         ║`);
  console.log('   ╚══════════════════════════════════════╝');
  console.log('');
  simulator.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  simulator.stop();
  httpServer.close(() => process.exit(0));
});