import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  IDashboardAdapter, DashboardSnapshot, Alert,
  SimulationEvent, ConnectionStatus, SimulatorConfig,
} from '@realtime-thesis/shared-ui';

const HISTORY     = 120;
const MIN_BACKOFF  =    200;   // ms – min przerwa po 204 (brak danych)
const MAX_BACKOFF  =  5_000;   // ms – max przerwa przy błędach serwera
const PING_INTERVAL = 10_000;  // ms – jak często mierzyć RTT (rzadziej niż WS)

const pollTimeout = (intervalMs: number) => Math.min(intervalMs * 5, 10_000);

function calcThroughput(prev: number, prevTime: number, curr: number, now: number) {
  const dt = (now - prevTime) / 1000;
  return dt > 0 ? Math.round((curr - prev) / dt) : 0;
}

/**
 * Long Polling implementation of IDashboardAdapter.
 *
 * Używany w:  apps/dashboard-longpolling/src/App.tsx
 * Serwer:     servers/longpolling-server  (port 4007)
 *
 * Pętla poll:
 *   GET /poll?since=<seq>&timeout=10000
 *     → 200 { snapshot, config }  → zapisz, natychmiast następny request
 *     → 204                       → brak nowych danych, czekaj MIN_BACKOFF i ponów
 *     → błąd sieciowy             → exponential backoff, ustaw status 'error'
 */
export function useLongPollingAdapter(baseUrl = 'http://localhost:4007'): IDashboardAdapter {
  const [status,           setStatus]           = useState<ConnectionStatus>('disconnected');
  const [snapshot,         setSnapshot]         = useState<DashboardSnapshot | null>(null);
  const [history,          setHistory]          = useState<DashboardSnapshot[]>([]);
  const [latency,          setLatency]          = useState<number | null>(null);
  const [latencyHistory,   setLatencyHistory]   = useState<number[]>([]);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [msgsPerSec,       setMsgsPerSec]       = useState(0);
  const [lostPackets,      setLostPackets]      = useState(0);
  const [currentIntervalMs, setCurrentIntervalMs] = useState(1000);
  const [paused,           setPaused]           = useState(false);
  const [alerts,           setAlerts]           = useState<Alert[]>([]);
  const [alertHistory,     setAlertHistory]     = useState<Alert[]>([]);

  // Refs (nie powodują re-renderów)
  const abortRef    = useRef<AbortController | null>(null);
  const pingRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const tpRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef  = useRef(false);
  const pausedRef   = useRef(false);
  const lastSeqRef  = useRef(0);
  const backoffRef  = useRef(MIN_BACKOFF);
  const msgCntRef   = useRef(0);
  const tpSnapRef   = useRef({ count: 0, time: Date.now() });
  const intervalMsRef = useRef(1000); 

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { intervalMsRef.current = currentIntervalMs; }, [currentIntervalMs]);

  // ─── Obsługa odebranego snapshota ──────────────────────────────────────────
  const handleSnapshot = useCallback((snap: DashboardSnapshot, cfg?: SimulatorConfig) => {
    // Wykryj utratę pakietów
    if (lastSeqRef.current > 0 && snap.sequenceId > lastSeqRef.current + 1)
      setLostPackets(p => p + (snap.sequenceId - lastSeqRef.current - 1));
    lastSeqRef.current = snap.sequenceId;
    msgCntRef.current++;

    if (cfg) setCurrentIntervalMs(cfg.intervalMs);
    if (pausedRef.current) return;

    setSnapshot(snap);
    setAlerts(snap.alerts);
    if (snap.alerts.length > 0)
      setAlertHistory(p =>
        [...snap.alerts.map(a => ({ ...a, triggeredAt: Date.now() })), ...p].slice(0, 60)
      );
    setMessagesReceived(p => p + 1);
    setHistory(p => [...p, snap].slice(-HISTORY));
  }, []);

  // ─── Poll loop ─────────────────────────────────────────────────────────────
  const pollLoop = useCallback(async () => {
    // Initial snapshot – nie czekaj na pierwszy tick symulatora
    try {
      const r = await fetch(`${baseUrl}/snapshot`);
      if (r.ok) {
        const { snapshot: snap, config } = await r.json();
        handleSnapshot(snap, config);
      }
    } catch { /* ignore – może jeszcze nie ma danych */ }

    setStatus('connected');
    backoffRef.current = MIN_BACKOFF;

    while (runningRef.current) {
      if (pausedRef.current) {
        await sleep(500);
        continue;
      }

      abortRef.current = new AbortController();
      const t0 = Date.now();

      try {
        const timeout = pollTimeout(intervalMsRef.current);
        const url = `${baseUrl}/poll?since=${lastSeqRef.current}&timeout=${timeout}`;
        const res = await fetch(url, {
          signal: abortRef.current.signal,
          headers: { 'Accept': 'application/json' },
        });

        const rtt = Date.now() - t0;
        setLatency(rtt);
        setLatencyHistory(p => [...p, rtt].slice(-30));

        if (res.status === 200) {
          const { snapshot: snap, config } = await res.json();
          handleSnapshot(snap, config);
          backoffRef.current = MIN_BACKOFF;   // reset backoff po sukcesie
          setStatus('connected');
          // Natychmiast następny poll – nie czekaj
        } else if (res.status === 204) {
          // Timeout serwera – brak nowych danych, krótka przerwa
          await sleep(backoffRef.current);
        } else {
          // Błąd serwera
          console.warn(`[LP] Server error ${res.status}`);
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
          setStatus('error');
          await sleep(backoffRef.current);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') break;  // stop() wywołany
        console.warn('[LP] Fetch error:', err);
        setStatus('error');
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        await sleep(backoffRef.current);
        setStatus('connecting');
      }
    }

    setStatus('disconnected');
  }, [baseUrl, handleSnapshot]);

  // ─── Start / stop ─────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus('connecting');
    pollLoop();

    // RTT ping (niezależny od poll loop)
    pingRef.current = setInterval(async () => {
      const t0 = Date.now();
      try {
        await fetch(`${baseUrl}/ping`);
        const rtt = Date.now() - t0;
        setLatency(rtt);
        setLatencyHistory(p => [...p, rtt].slice(-30));
      } catch { /* offline */ }
    }, PING_INTERVAL);
  }, [baseUrl, pollLoop]);

  const stop = useCallback(() => {
    runningRef.current = false;
    abortRef.current?.abort();
    if (pingRef.current) clearInterval(pingRef.current);
    if (tpRef.current)   clearInterval(tpRef.current);
  }, []);

  // ─── Throughput meter ─────────────────────────────────────────────────────
  useEffect(() => {
    tpRef.current = setInterval(() => {
      const now = Date.now();
      const { count, time } = tpSnapRef.current;
      setMsgsPerSec(calcThroughput(count, time, msgCntRef.current, now));
      tpSnapRef.current = { count: msgCntRef.current, time: now };
    }, 1000);
    return () => { if (tpRef.current) clearInterval(tpRef.current); };
  }, []);

  useEffect(() => { start(); return stop; }, [start, stop]);

  // ─── Akcje ────────────────────────────────────────────────────────────────
  const injectEvent = useCallback((event: SimulationEvent) => {
    fetch(`${baseUrl}/api/event`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event }),
    });
  }, [baseUrl]);

  const setIntervalMs = useCallback((ms: number) => {
    setCurrentIntervalMs(ms);
    fetch(`${baseUrl}/api/interval`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ms }),
    });
  }, [baseUrl]);

  const togglePause = useCallback(() => setPaused(p => !p), []);

  return {
    technology: 'Long Polling',
    status, snapshot, history,
    latency, latencyHistory,
    messagesReceived, msgsPerSec, lostPackets,
    currentIntervalMs, paused,
    alerts, alertHistory,
    injectEvent, setIntervalMs, togglePause,
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));