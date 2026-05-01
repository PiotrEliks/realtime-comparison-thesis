// ─── Metryki serwera → klient ─────────────────────────────────────────────────

export interface SystemMetrics {
  cpu:     { total: number; cores: number[]; temperature: number };
  ram:     { used: number; total: number; percent: number; swap: number };
  disk:    { readSpeed: number; writeSpeed: number; iops: number };
  network: { bytesIn: number; bytesOut: number; packetsDropped: number; latency: number };
}

export interface StockTicker {
  symbol:        string;
  price:         number;
  change:        number;
  changePercent: number;
  dayChange:     number;
  dayChangePct:  number;
  volume:        number;
  bid:           number;
  ask:           number;
  high24h:       number;
  low24h:        number;
  openPrice:     number;
}

export interface IoTSensor {
  id:           string;
  name:         string;
  location:     string;
  temperature:  number;
  humidity:     number;
  pressure:     number;
  co2:          number;
  noise:        number;
  batteryLevel: number;
  isOnline:     boolean;
  lastUpdate:   number;
}

export interface EndpointStat {
  path:       string;
  hits:       number;
  avgMs:      number;
  errorCount: number;
}

export interface AppServerMetrics {
  requestsPerSec:    number;
  activeConnections: number;
  errorRate:         number;
  avgResponseTime:   number;
  p95ResponseTime:   number;
  p99ResponseTime:   number;
  queueLength:       number;
  cacheHitRate:      number;
  endpoints:         EndpointStat[];
}

export interface Alert {
  id:          string;
  level:       'info' | 'warning' | 'critical';
  metric:      string;
  message:     string;
  value:       number;
  threshold:   number;
  triggeredAt: number;
}

export interface DashboardSnapshot {
  timestamp:  number;
  sequenceId: number;
  system:     SystemMetrics;
  stocks:     StockTicker[];
  iot:        IoTSensor[];
  appServer:  AppServerMetrics;
  alerts:     Alert[];
}

export interface SimulatorConfig {
  intervalMs:    number;
  historyLength: number;
  enableAlerts:  boolean;
}

export type SimulationEvent =
  | 'CPU_SPIKE' | 'MEMORY_LEAK' | 'NETWORK_OUTAGE'
  | 'STOCK_CRASH' | 'IOT_SENSOR_OFFLINE' | 'DDOS_SIMULATION';

// ─── WebSocket protokół ───────────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'SNAPSHOT';       data: DashboardSnapshot }
  | { type: 'CONNECTED';      clientId: string; config: SimulatorConfig }
  | { type: 'PONG';           timestamp: number; serverTime: number }
  | { type: 'CONFIG_UPDATED'; config: SimulatorConfig };

export type ClientMessage =
  | { type: 'PING';         timestamp: number }
  | { type: 'SET_INTERVAL'; intervalMs: number }
  | { type: 'INJECT_EVENT'; event: SimulationEvent };