import { EventEmitter } from 'events';
import type {
  DashboardSnapshot, SystemMetrics, StockTicker, IoTSensor,
  AppServerMetrics, Alert, SimulationEvent, SimulatorConfig,
} from '@realtime-thesis/shared-ui';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rand  = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const walk  = (v: number, step: number, lo: number, hi: number) => clamp(v + rand(-step, step), lo, hi);
const r     = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

interface SimState {
  cpu:    { total: number; cores: number[]; temp: number };
  ram:    { used: number; total: number; swap: number };
  disk:   { read: number; write: number; iops: number };
  net:    { inKB: number; outKB: number; dropped: number; latency: number };
  stocks: Array<{ symbol: string; price: number; open: number; high: number; low: number }>;
  iot:    Array<{
    id: string; name: string; location: string;
    temp: number; hum: number; pres: number; co2: number; noise: number;
    bat: number; online: boolean;
  }>;
  app: {
    rps: number; conns: number; errRate: number; avgMs: number;
    p95: number; p99: number; queue: number; cache: number;
  };
  ev: {
    cpuSpike: number; memLeak: number; netOut: number;
    crash: { ticks: number; sym: string }; ddos: number;
  };
}

export class DataSimulator extends EventEmitter {
  private cfg: SimulatorConfig;
  private h:   NodeJS.Timeout | null = null;
  private seq  = 0;

  private s: SimState = {
    cpu:  { total: 35, cores: [30, 40, 25, 45, 35, 50, 20, 38], temp: 55 },
    ram:  { used: 8192, total: 32768, swap: 256 },
    disk: { read: 120, write: 80, iops: 2400 },
    net:  { inKB: 1500, outKB: 800, dropped: 0, latency: 12 },
    stocks: [
      { symbol: 'AAPL', price: 189.50, open: 189.50, high: 191.20, low: 187.00 },
      { symbol: 'TSLA', price: 242.00, open: 242.00, high: 248.00, low: 238.50 },
      { symbol: 'NVDA', price: 875.30, open: 875.30, high: 882.00, low: 868.00 },
      { symbol: 'MSFT', price: 415.20, open: 415.20, high: 418.50, low: 412.00 },
      { symbol: 'AMZN', price: 196.80, open: 196.80, high: 198.00, low: 194.50 },
    ],
    iot: [
      { id: 's1', name: 'Serwer A',   location: 'Rack 1',  temp: 22.5, hum: 45, pres: 1013, co2: 420, noise: 55, bat: 100, online: true },
      { id: 's2', name: 'Serwer B',   location: 'Rack 2',  temp: 23.1, hum: 47, pres: 1012, co2: 430, noise: 57, bat: 100, online: true },
      { id: 's3', name: 'Biuro 1',    location: 'Floor 1', temp: 21.0, hum: 52, pres: 1014, co2: 680, noise: 42, bat:  87, online: true },
      { id: 's4', name: 'Biuro 2',    location: 'Floor 2', temp: 20.8, hum: 54, pres: 1013, co2: 720, noise: 45, bat:  63, online: true },
      { id: 's5', name: 'Wejście',    location: 'Lobby',   temp: 19.5, hum: 60, pres: 1013, co2: 500, noise: 68, bat:  45, online: true },
      { id: 's6', name: 'Zewnętrzny', location: 'Roof',    temp:  8.2, hum: 78, pres: 1009, co2: 415, noise: 35, bat:  92, online: true },
    ],
    app: { rps: 1200, conns: 340, errRate: 0.3, avgMs: 45, p95: 120, p99: 280, queue: 3, cache: 87 },
    ev:  { cpuSpike: 0, memLeak: 0, netOut: 0, crash: { ticks: 0, sym: '' }, ddos: 0 },
  };

  constructor(cfg?: Partial<SimulatorConfig>) {
    super();
    this.cfg = { intervalMs: 250, historyLength: 300, enableAlerts: true, ...cfg };
  }

  start() {
    if (this.h) return;
    console.log(`▶  DataSimulator  [${this.cfg.intervalMs}ms]`);
    this.h = setInterval(() => this.tick(), this.cfg.intervalMs);
  }

  stop() {
    if (!this.h) return;
    clearInterval(this.h);
    this.h = null;
    console.log('■  DataSimulator stopped');
  }

  updateConfig(patch: Partial<SimulatorConfig>) {
    const running = !!this.h;
    this.stop();
    this.cfg = { ...this.cfg, ...patch };
    if (running) this.start();
    this.emit('configChanged', this.cfg);
  }

  getConfig(): SimulatorConfig { return { ...this.cfg }; }

  injectEvent(ev: SimulationEvent) {
    const e = this.s.ev;
    switch (ev) {
      case 'CPU_SPIKE':          e.cpuSpike = 20; break;
      case 'MEMORY_LEAK':        e.memLeak  = 40; break;
      case 'NETWORK_OUTAGE':     e.netOut   = 12; break;
      case 'DDOS_SIMULATION':    e.ddos     = 16; break;
      case 'STOCK_CRASH': {
        const i = Math.floor(Math.random() * this.s.stocks.length);
        e.crash = { ticks: 10, sym: this.s.stocks[i].symbol };
        break;
      }
      case 'IOT_SENSOR_OFFLINE': {
        const i = Math.floor(Math.random() * this.s.iot.length);
        this.s.iot[i].online = false;
        setTimeout(() => { this.s.iot[i].online = true; }, 5000);
        break;
      }
    }
    console.log(`⚡ ${ev}`);
  }

  private tick() {
    this.seq++;
    const snap: DashboardSnapshot = {
      timestamp: Date.now(), sequenceId: this.seq,
      system: this.genSystem(), stocks: this.genStocks(),
      iot: this.genIoT(), appServer: this.genApp(), alerts: [],
    };
    if (this.cfg.enableAlerts) snap.alerts = this.checkAlerts(snap);
    this.emit('snapshot', snap);
  }

  private genSystem(): SystemMetrics {
    const { s } = this;
    let cpuDelta = rand(-3, 3.2);
    if (s.ev.cpuSpike > 0) { cpuDelta += rand(20, 40); s.ev.cpuSpike--; }
    s.cpu.total = r(clamp(s.cpu.total + cpuDelta, 2, 99));
    s.cpu.cores = s.cpu.cores.map(c => r(clamp(c + rand(-8, 8), 0, 100)));
    const tgt   = 38 + s.cpu.total * 0.52;
    s.cpu.temp  = r(s.cpu.temp + (tgt - s.cpu.temp) * 0.05 + rand(-0.3, 0.3), 1);
    let ramDelta = rand(-80, 70);
    if (s.ev.memLeak > 0) { ramDelta += rand(400, 700); s.ev.memLeak--; }
    s.ram.used   = clamp(s.ram.used + ramDelta, 2048, s.ram.total - 512);
    s.ram.swap   = r(walk(s.ram.swap, 25, 0, 4096));
    s.disk.read  = r(walk(s.disk.read,  25, 0,  800));
    s.disk.write = r(walk(s.disk.write, 15, 0,  500));
    s.disk.iops  = r(walk(s.disk.iops, 300, 100, 15000));
    if (s.ev.netOut > 0) {
      s.net.inKB    = clamp(s.net.inKB * 0.25, 0, Infinity);
      s.net.dropped = r(walk(s.net.dropped, 60, 30, 600));
      s.ev.netOut--;
    } else {
      s.net.inKB    = clamp(s.net.inKB + rand(-200, 280), 0, 20000);
      s.net.dropped = r(walk(s.net.dropped, 0.4, 0, 4));
    }
    s.net.outKB   = clamp(s.net.outKB + rand(-100, 140), 0, 10000);
    s.net.latency = r(walk(s.net.latency, 2, 1, 200));
    return {
      cpu:  { total: s.cpu.total, cores: [...s.cpu.cores], temperature: s.cpu.temp },
      ram:  { used: Math.round(s.ram.used), total: s.ram.total, percent: r((s.ram.used / s.ram.total) * 100, 1), swap: Math.round(s.ram.swap) },
      disk: { readSpeed: s.disk.read, writeSpeed: s.disk.write, iops: Math.round(s.disk.iops) },
      network: { bytesIn: Math.round(s.net.inKB), bytesOut: Math.round(s.net.outKB), packetsDropped: Math.round(s.net.dropped), latency: s.net.latency },
    };
  }

  private genStocks(): StockTicker[] {
    const { crash } = this.s.ev;
    return this.s.stocks.map(st => {
      const crashing = crash.ticks > 0 && st.symbol === crash.sym;
      const vol   = st.price * 0.0018;
      const drift = crashing ? rand(-5, -1) * vol : rand(-vol, vol * 1.06);
      const prev  = st.price;
      st.price = r(clamp(st.price + drift, st.price * 0.4, st.price * 2.5), 2);
      if (crashing) crash.ticks--;
      st.high = Math.max(st.high, st.price);
      st.low  = Math.min(st.low,  st.price);
      const sp = st.price * 0.00015;
      return {
        symbol: st.symbol, price: st.price,
        change: r(st.price - prev, 2),
        changePercent: r(((st.price - prev) / prev) * 100, 3),
        dayChange: r(st.price - st.open, 2),
        dayChangePct: r(((st.price - st.open) / st.open) * 100, 2),
        volume: Math.round(rand(300, 9000)),
        bid: r(st.price - sp, 2), ask: r(st.price + sp, 2),
        high24h: r(st.high, 2), low24h: r(st.low, 2), openPrice: r(st.open, 2),
      };
    });
  }

  private genIoT(): IoTSensor[] {
    return this.s.iot.map(s => {
      if (!s.online) return { id: s.id, name: s.name, location: s.location, temperature: 0, humidity: 0, pressure: 0, co2: 0, noise: 0, batteryLevel: s.bat, isOnline: false, lastUpdate: Date.now() };
      const out = s.location === 'Roof';
      s.temp  = r(walk(s.temp,  out ? 0.5 : 0.08, out ? -15 : 14, out ? 45 : 32), 1);
      s.hum   = r(walk(s.hum,   out ? 2   : 0.5,  20, 95), 1);
      s.pres  = r(walk(s.pres,  0.3, 985, 1035), 1);
      s.co2   = r(walk(s.co2,   20,  380, 2200));
      s.noise = r(walk(s.noise, 3,   18,  95),  1);
      if (Math.random() < 0.0008) s.bat = clamp(s.bat - 0.1, 0, 100);
      return { id: s.id, name: s.name, location: s.location, temperature: s.temp, humidity: s.hum, pressure: s.pres, co2: Math.round(s.co2), noise: s.noise, batteryLevel: r(s.bat, 1), isOnline: true, lastUpdate: Date.now() };
    });
  }

  private genApp(): AppServerMetrics {
    const a = this.s.app;
    if (this.s.ev.ddos > 0) {
      a.rps     = clamp(a.rps  + rand(3000, 8000), 0, 80000);
      a.conns   = clamp(a.conns + rand(800, 2000),  0, 20000);
      a.errRate = clamp(a.errRate + rand(8, 25),     0, 100);
      this.s.ev.ddos--;
    } else {
      a.rps     = clamp(a.rps  + rand(-80, 90),   0, 50000);
      a.conns   = clamp(a.conns + rand(-15, 18),   0, 10000);
      a.errRate = clamp(a.errRate + rand(-0.15, 0.12), 0, 100);
    }
    a.avgMs = r(walk(a.avgMs, 6, 5, 2000));
    a.p95   = r(clamp(a.avgMs * rand(2.2, 3.8), a.avgMs + 10, 5000));
    a.p99   = r(clamp(a.p95   * rand(1.6, 2.6), a.p95   + 20, 12000));
    a.queue = Math.round(clamp(walk(a.queue, 2.5, 0, 500), 0, 500));
    a.cache = r(walk(a.cache, 1.2, 35, 99));
    const defs = [
      { path: '/api/users',    share: 0.25, lf: 1.0 },
      { path: '/api/products', share: 0.35, lf: 1.3 },
      { path: '/api/orders',   share: 0.20, lf: 1.7 },
      { path: '/api/search',   share: 0.15, lf: 2.5 },
      { path: '/api/auth',     share: 0.05, lf: 0.7 },
    ];
    return {
      requestsPerSec: Math.round(a.rps), activeConnections: Math.round(a.conns),
      errorRate: r(a.errRate, 3), avgResponseTime: a.avgMs,
      p95ResponseTime: a.p95, p99ResponseTime: a.p99,
      queueLength: a.queue, cacheHitRate: a.cache,
      endpoints: defs.map(d => ({
        path: d.path,
        hits: Math.round(a.rps * d.share * rand(0.85, 1.15)),
        avgMs: r(a.avgMs * d.lf * rand(0.9, 1.1)),
        errorCount: Math.round(a.rps * d.share * rand(0.85, 1.15) * (a.errRate / 100) * rand(0.5, 1.5)),
      })),
    };
  }

  private checkAlerts(snap: DashboardSnapshot): Alert[] {
    const res: Alert[] = [];
    const now = Date.now();
    const chk = (id: string, metric: string, value: number, warn: number, crit: number, unit: string, inv = false) => {
      const bad = inv ? value <= crit : value >= crit;
      const wrn = inv ? value <= warn : value >= warn;
      if (bad || wrn) res.push({
        id, level: bad ? 'critical' : 'warning', metric,
        message: `${metric}: ${r(value)}${unit} (thresh ${bad ? crit : warn}${unit})`,
        value: r(value), threshold: bad ? crit : warn, triggeredAt: now,
      });
    };
    chk('cpu',      'CPU Usage',       snap.system.cpu.total,              75, 90,   '%');
    chk('cputemp',  'CPU Temp',        snap.system.cpu.temperature,        72, 85,   '°C');
    chk('ram',      'RAM',             snap.system.ram.percent,            80, 95,   '%');
    chk('netdrop',  'Packets Dropped', snap.system.network.packetsDropped, 20, 100,  '/s');
    chk('netlat',   'Net Latency',     snap.system.network.latency,        50, 120,  'ms');
    chk('apperr',   'Error Rate',      snap.appServer.errorRate,            2, 10,   '%');
    chk('appp99',   'p99 Latency',     snap.appServer.p99ResponseTime,    500, 2000, 'ms');
    chk('appqueue', 'Request Queue',   snap.appServer.queueLength,         50, 200,  '');
    chk('cache',    'Cache Hit',       snap.appServer.cacheHitRate,        60, 40,   '%', true);
    snap.iot.forEach(s => {
      if (!s.isOnline)
        res.push({ id: `offline_${s.id}`, level: 'critical', metric: 'Sensor Offline',
          message: `${s.name} (${s.location}) is offline`, value: 0, threshold: 1, triggeredAt: now });
      else if (s.co2 > 1500)
        res.push({ id: `co2_${s.id}`, level: s.co2 > 1800 ? 'critical' : 'warning',
          metric: `CO₂ – ${s.name}`, message: `High CO₂ at ${s.location}: ${s.co2} ppm`,
          value: s.co2, threshold: 1500, triggeredAt: now });
    });
    return res;
  }
}