import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  IDashboardAdapter, DashboardSnapshot, Alert,
  SimulationEvent, ConnectionStatus,
} from '@realtime-thesis/shared-ui';

const HISTORY = 120;

function calcThroughput(prevCount: number, prevTime: number, count: number, now: number) {
  const dt = (now - prevTime) / 1000;
  return dt > 0 ? Math.round((count - prevCount) / dt) : 0;
}

/**
 * WebSocket implementation of IDashboardAdapter.
 *
 * Używany w:  apps/dashboard-websocket/src/App.tsx
 * Serwer:     servers/websocket-dashboard-server  (port 4005)
 */
export function useWebSocketAdapter(url: string): IDashboardAdapter {
  const [status,           setStatus]           = useState<ConnectionStatus>('disconnected');
  const [snapshot,         setSnapshot]         = useState<DashboardSnapshot | null>(null);
  const [history,          setHistory]          = useState<DashboardSnapshot[]>([]);
  const [latency,          setLatency]          = useState<number | null>(null);
  const [latencyHistory,   setLatencyHistory]   = useState<number[]>([]);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [msgsPerSec,       setMsgsPerSec]       = useState(0);
  const [lostPackets,      setLostPackets]      = useState(0);
  const [currentIntervalMs, setCurrentIntervalMs] = useState(250);
  const [paused,           setPaused]           = useState(false);
  const [alerts,           setAlerts]           = useState<Alert[]>([]);
  const [alertHistory,     setAlertHistory]     = useState<Alert[]>([]);

  const wsRef      = useRef<WebSocket | null>(null);
  const pingRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const tpRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeqRef = useRef(0);
  const msgCntRef  = useRef(0);
  const tpSnapRef  = useRef({ count: 0, time: Date.now() });
  const pausedRef  = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
      }, 5000);
    };

    ws.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        switch (msg.type) {

          case 'SNAPSHOT': {
            const snap: DashboardSnapshot = msg.data;
            // Detect lost packets via sequence gaps
            if (lastSeqRef.current > 0 && snap.sequenceId > lastSeqRef.current + 1)
              setLostPackets(p => p + (snap.sequenceId - lastSeqRef.current - 1));
            lastSeqRef.current = snap.sequenceId;
            msgCntRef.current++;
            if (pausedRef.current) break;
            setSnapshot(snap);
            setAlerts(snap.alerts);
            if (snap.alerts.length > 0)
              setAlertHistory(p =>
                [...snap.alerts.map(a => ({ ...a, triggeredAt: Date.now() })), ...p].slice(0, 60)
              );
            setMessagesReceived(p => p + 1);
            setHistory(p => [...p, snap].slice(-HISTORY));
            break;
          }

          case 'PONG': {
            const rtt = Date.now() - msg.timestamp;
            setLatency(rtt);
            setLatencyHistory(p => [...p, rtt].slice(-30));
            break;
          }

          case 'CONNECTED':
            setCurrentIntervalMs(msg.config.intervalMs);
            break;

          case 'CONFIG_UPDATED':
            setCurrentIntervalMs(msg.config.intervalMs);
            break;
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (pingRef.current) clearInterval(pingRef.current);
      reconnRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => setStatus('error');
  }, [url]);

  const disconnect = useCallback(() => {
    if (reconnRef.current)  clearTimeout(reconnRef.current);
    if (pingRef.current)    clearInterval(pingRef.current);
    wsRef.current?.close();
    setStatus('disconnected');
  }, []);

  // Throughput meter — runs every second
  useEffect(() => {
    tpRef.current = setInterval(() => {
      const now = Date.now();
      const { count, time } = tpSnapRef.current;
      setMsgsPerSec(calcThroughput(count, time, msgCntRef.current, now));
      tpSnapRef.current = { count: msgCntRef.current, time: now };
    }, 1000);
    return () => { if (tpRef.current) clearInterval(tpRef.current); };
  }, []);

  useEffect(() => { connect(); return disconnect; }, [connect, disconnect]);

  const injectEvent = useCallback((event: SimulationEvent) => {
    wsRef.current?.send(JSON.stringify({ type: 'INJECT_EVENT', event }));
  }, []);

  const setIntervalMs = useCallback((ms: number) => {
    wsRef.current?.send(JSON.stringify({ type: 'SET_INTERVAL', intervalMs: ms }));
  }, []);

  const togglePause = useCallback(() => setPaused(p => !p), []);

  return {
    technology: 'WebSocket',
    status, snapshot, history,
    latency, latencyHistory,
    messagesReceived, msgsPerSec, lostPackets,
    currentIntervalMs, paused,
    alerts, alertHistory,
    injectEvent, setIntervalMs, togglePause,
  };
}