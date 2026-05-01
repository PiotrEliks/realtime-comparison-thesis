import { WebSocket, WebSocketServer } from 'ws';
import { DataSimulator } from '../simulator/DataSimulator';
import type { DashboardSnapshot, SimulationEvent } from '@realtime-thesis/shared-ui';

type ServerMsg =
  | { type: 'SNAPSHOT';       data: DashboardSnapshot }
  | { type: 'CONNECTED';      clientId: string; config: object }
  | { type: 'PONG';           timestamp: number; serverTime: number }
  | { type: 'CONFIG_UPDATED'; config: object };

type ClientMsg =
  | { type: 'PING';         timestamp: number }
  | { type: 'SET_INTERVAL'; intervalMs: number }
  | { type: 'INJECT_EVENT'; event: SimulationEvent };

interface Client { id: string; ws: WebSocket; connectedAt: number }

export class DashboardManager {
  private clients: Map<string, Client> = new Map();
  private history: DashboardSnapshot[] = [];
  private readonly MAX_HISTORY = 300;

  constructor(private wss: WebSocketServer, private sim: DataSimulator) {
    sim.on('snapshot', (snap: DashboardSnapshot) => {
      this.history.push(snap);
      if (this.history.length > this.MAX_HISTORY) this.history.shift();
      this.broadcast({ type: 'SNAPSHOT', data: snap });
    });
    wss.on('connection', ws => this.onConnect(ws));
    console.log('📡 DashboardManager ready');
  }

  private onConnect(ws: WebSocket) {
    const id = crypto.randomUUID().slice(0, 8);
    this.clients.set(id, { id, ws, connectedAt: Date.now() });
    console.log(`✅ [${id}] connected  (${this.clients.size} total)`);

    this.send(ws, { type: 'CONNECTED', clientId: id, config: this.sim.getConfig() });
    if (this.history.length > 0)
      this.send(ws, { type: 'SNAPSHOT', data: this.history[this.history.length - 1] });

    ws.on('message', raw => {
      try { this.onMessage(ws, JSON.parse(raw.toString()) as ClientMsg); }
      catch { /* ignore malformed */ }
    });
    ws.on('close', () => { this.clients.delete(id); console.log(`❌ [${id}] disconnected`); });
    ws.on('error', err => { console.error(`[${id}]`, err.message); this.clients.delete(id); });
  }

  private onMessage(ws: WebSocket, msg: ClientMsg) {
    switch (msg.type) {
      case 'PING':
        this.send(ws, { type: 'PONG', timestamp: msg.timestamp, serverTime: Date.now() });
        break;
      case 'SET_INTERVAL': {
        const ms = Math.max(100, Math.min(5000, msg.intervalMs));
        this.sim.updateConfig({ intervalMs: ms });
        this.broadcast({ type: 'CONFIG_UPDATED', config: this.sim.getConfig() });
        break;
      }
      case 'INJECT_EVENT':
        this.sim.injectEvent(msg.event);
        break;
    }
  }

  private broadcast(msg: ServerMsg) {
    const payload = JSON.stringify(msg);
    const dead: string[] = [];
    this.clients.forEach(c => {
      c.ws.readyState === WebSocket.OPEN ? c.ws.send(payload) : dead.push(c.id);
    });
    dead.forEach(id => this.clients.delete(id));
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  stats() { return { clients: this.clients.size, history: this.history.length }; }
}