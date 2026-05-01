import { useState, useEffect, useRef, useCallback } from 'react';

export interface StockTicker {
  symbol: string; price: number; change: number; changePercent: number;
  dayChange: number; dayChangePct: number;
  volume: number; bid: number; ask: number;
  high24h: number; low24h: number; openPrice: number;
}

export interface DashboardSnapshot {
  timestamp: number;
  sequenceId: number;
  system: {
    cpu:     { total: number; cores: number[]; temperature: number };
    ram:     { used: number; total: number; percent: number; swap: number };
    disk:    { readSpeed: number; writeSpeed: number; iops: number };
    network: { bytesIn: number; bytesOut: number; packetsDropped: number; latency: number };
  };
  stocks: StockTicker[];
  iot: Array<{
    id: string; name: string; location: string;
    temperature: number; humidity: number; pressure: number;
    co2: number; noise: number; batteryLevel: number;
    isOnline: boolean; lastUpdate: number;
  }>;
  appServer: {
    requestsPerSec: number; activeConnections: number; errorRate: number;
    avgResponseTime: number; p95ResponseTime: number; p99ResponseTime: number;
    queueLength: number; cacheHitRate: number;
    endpoints: Array<{ path: string; hits: number; avgMs: number; errorCount: number }>;
  };
  alerts: Array<{
    id: string; level: 'info' | 'warning' | 'critical';
    metric: string; message: string;
    value: number; threshold: number; triggeredAt: number;
  }>;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const HISTORY_SIZE = 120;

function computeStats(prevCount: number, prevTime: number, newCount: number, now: number) {
  const elapsed = (now - prevTime) / 1000;
  return elapsed > 0 ? Math.round((newCount - prevCount) / elapsed) : 0;
}

export function useDashboard(url: string) {
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
  const [alerts,           setAlerts]           = useState<DashboardSnapshot['alerts']>([]);
  const [alertHistory,     setAlertHistory]     = useState<DashboardSnapshot['alerts']>([]);

  const wsRef          = useRef<WebSocket | null>(null);
  const pingRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const throughputRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeqRef     = useRef(0);
  const msgCountRef    = useRef(0);
  const msgCountAtRef  = useRef({ count: 0, time: Date.now() });
  const pausedRef      = useRef(false);

  // Keep pausedRef in sync
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      // Ping every 5s for RTT measurement
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
      }, 5000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'SNAPSHOT': {
            const data: DashboardSnapshot = msg.data;

            // Detect lost packets
            if (lastSeqRef.current > 0 && data.sequenceId > lastSeqRef.current + 1) {
              setLostPackets(prev => prev + (data.sequenceId - lastSeqRef.current - 1));
            }
            lastSeqRef.current = data.sequenceId;
            msgCountRef.current++;

            // If paused, don't update display state
            if (pausedRef.current) break;

            setSnapshot(data);
            setAlerts(data.alerts);
            if (data.alerts.length > 0) {
              setAlertHistory(prev => [
                ...data.alerts.map(a => ({ ...a, triggeredAt: Date.now() })),
                ...prev,
              ].slice(0, 50));
            }
            setMessagesReceived(prev => prev + 1);
            setHistory(prev => [...prev, data].slice(-HISTORY_SIZE));
            break;
          }

          case 'PONG': {
            const rtt = Date.now() - msg.timestamp;
            setLatency(rtt);
            setLatencyHistory(prev => [...prev, rtt].slice(-30));
            break;
          }

          case 'CONNECTED':
            console.log('🔗 Client ID:', msg.clientId);
            setCurrentIntervalMs(msg.config.intervalMs);
            break;

          case 'CONFIG_UPDATED':
            setCurrentIntervalMs(msg.config.intervalMs);
            break;
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (pingRef.current) clearInterval(pingRef.current);
      reconnectRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => setStatus('error');
  }, [url]);

  const disconnect = useCallback(() => {
    if (reconnectRef.current)  clearTimeout(reconnectRef.current);
    if (pingRef.current)       clearInterval(pingRef.current);
    if (throughputRef.current) clearInterval(throughputRef.current);
    wsRef.current?.close();
    setStatus('disconnected');
  }, []);

  // Throughput meter — update msgs/s every second
  useEffect(() => {
    throughputRef.current = setInterval(() => {
      const now = Date.now();
      const { count, time } = msgCountAtRef.current;
      setMsgsPerSec(computeStats(count, time, msgCountRef.current, now));
      msgCountAtRef.current = { count: msgCountRef.current, time: now };
    }, 1000);
    return () => { if (throughputRef.current) clearInterval(throughputRef.current); };
  }, []);

  useEffect(() => { connect(); return disconnect; }, [connect, disconnect]);

  const injectEvent = useCallback((event: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'INJECT_EVENT', event }));
  }, []);

  const setIntervalMs = useCallback((ms: number) => {
    wsRef.current?.send(JSON.stringify({ type: 'SET_INTERVAL', intervalMs: ms }));
  }, []);

  const togglePause = useCallback(() => setPaused(p => !p), []);

  return {
    status, snapshot, history, latency, latencyHistory,
    messagesReceived, msgsPerSec, lostPackets,
    currentIntervalMs, paused,
    alerts, alertHistory,
    injectEvent, setIntervalMs, togglePause,
  };
}