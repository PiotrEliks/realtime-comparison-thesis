import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  IDashboardAdapter, DashboardSnapshot, Alert,
  SimulationEvent, ConnectionStatus,
} from '@realtime-thesis/shared-ui';

const HISTORY  = 120;

/**
 * SSE implementation of IDashboardAdapter.
 *
 * Używany w:  apps/dashboard-sse/src/App.tsx
 * Serwer:     servers/sse-server  (port 4006)
 *
 * Różnice vs WebSocket:
 *  - EventSource (tylko serwer → klient)
 *  - injectEvent i setIntervalMs → HTTP POST
 *  - RTT mierzony przez /ping endpoint
 */
export function useSSEAdapter(baseUrl = 'http://localhost:4006'): IDashboardAdapter {
  const [status,           setStatus]           = useState<ConnectionStatus>('disconnected');
  const [snapshot,         setSnapshot]         = useState<DashboardSnapshot | null>(null);
  const [history,          setHistory]          = useState<DashboardSnapshot[]>([]);
  const [latency,          setLatency]          = useState<number | null>(null);
  const [latencyHistory,   setLatencyHistory]   = useState<number[]>([]);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [msgsPerSec,       setMsgsPerSec]       = useState(0);
  const [lostPackets]                           = useState(0);  // SSE reconnects gracefully
  const [currentIntervalMs, setCurrentIntervalMs] = useState(250);
  const [paused,           setPaused]           = useState(false);
  const [alerts,           setAlerts]           = useState<Alert[]>([]);
  const [alertHistory,     setAlertHistory]     = useState<Alert[]>([]);

  const esRef      = useRef<EventSource | null>(null);
  const pingRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const tpRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeqRef = useRef(0);
  const msgCntRef  = useRef(0);
  const tpSnapRef  = useRef({ count: 0, time: Date.now() });
  const pausedRef  = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const connect = useCallback(() => {
    esRef.current?.close();
    setStatus('connecting');

    const es = new EventSource(`${baseUrl}/stream`);
    esRef.current = es;

    es.onopen  = () => setStatus('connected');
    es.onerror = () => setStatus('error'); // EventSource auto-reconnects

    es.addEventListener('snapshot', (e: MessageEvent) => {
      try {
        const snap: DashboardSnapshot = JSON.parse(e.data);
        lastSeqRef.current = snap.sequenceId;
        msgCntRef.current++;
        if (pausedRef.current) return;
        setSnapshot(snap);
        setAlerts(snap.alerts);
        if (snap.alerts.length > 0)
          setAlertHistory(p =>
            [...snap.alerts.map(a => ({ ...a, triggeredAt: Date.now() })), ...p].slice(0, 60)
          );
        setMessagesReceived(p => p + 1);
        setHistory(p => [...p, snap].slice(-HISTORY));
      } catch { /* ignore */ }
    });

    es.addEventListener('config', (e: MessageEvent) => {
      try { setCurrentIntervalMs(JSON.parse(e.data).intervalMs); } catch { /* ignore */ }
    });

    // RTT via HTTP ping
    pingRef.current = setInterval(async () => {
      const t0 = Date.now();
      try {
        await fetch(`${baseUrl}/ping`);
        const rtt = Date.now() - t0;
        setLatency(rtt);
        setLatencyHistory(p => [...p, rtt].slice(-30));
      } catch { /* offline */ }
    }, 5000);
  }, [baseUrl]);

  const disconnect = useCallback(() => {
    if (pingRef.current) clearInterval(pingRef.current);
    if (tpRef.current)   clearInterval(tpRef.current);
    esRef.current?.close();
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    tpRef.current = setInterval(() => {
      const now = Date.now();
      const { count, time } = tpSnapRef.current;
      const dt = (now - time) / 1000;
      setMsgsPerSec(dt > 0 ? Math.round((msgCntRef.current - count) / dt) : 0);
      tpSnapRef.current = { count: msgCntRef.current, time: now };
    }, 1000);
    return () => { if (tpRef.current) clearInterval(tpRef.current); };
  }, []);

  useEffect(() => { connect(); return disconnect; }, [connect, disconnect]);

  // SSE is one-way → control via REST
  const injectEvent = useCallback((event: SimulationEvent) => {
    fetch(`${baseUrl}/api/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    });
  }, [baseUrl]);

  const setIntervalMs = useCallback((ms: number) => {
    setCurrentIntervalMs(ms);
    fetch(`${baseUrl}/api/interval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ms }),
    });
  }, [baseUrl]);

  const togglePause = useCallback(() => setPaused(p => !p), []);

  return {
    technology: 'SSE',
    status, snapshot, history,
    latency, latencyHistory,
    messagesReceived, msgsPerSec, lostPackets,
    currentIntervalMs, paused,
    alerts, alertHistory,
    injectEvent, setIntervalMs, togglePause,
  };
}