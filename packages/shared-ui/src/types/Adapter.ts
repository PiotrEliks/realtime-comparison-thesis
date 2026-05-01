import type { DashboardSnapshot, Alert, SimulationEvent } from './metrics';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Kontrakt który musi spełniać każdy adapter technologii (WS, SSE, LP, WebRTC).
 * DashboardShell konsumuje wyłącznie ten interfejs – nie zna szczegółów technologii.
 */
export interface IDashboardAdapter {
  // Połączenie
  status:           ConnectionStatus;
  technology:       string;           // 'WebSocket' | 'SSE' | 'Long Polling' | …

  // Dane live
  snapshot:         DashboardSnapshot | null;
  history:          DashboardSnapshot[];

  // Metryki wydajności
  latency:          number | null;
  latencyHistory:   number[];
  messagesReceived: number;
  msgsPerSec:       number;
  lostPackets:      number;

  // Konfiguracja
  currentIntervalMs: number;
  paused:           boolean;

  // Alerty
  alerts:           Alert[];
  alertHistory:     Alert[];

  // Akcje
  injectEvent(event: SimulationEvent): void;
  setIntervalMs(ms: number): void;
  togglePause(): void;
}