import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';

const config = parseArgs(process.argv.slice(2));
const runId = config.runId || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const resultDir = path.resolve(config.resultDir);
fs.mkdirSync(resultDir, { recursive: true });

const rawPath = path.join(resultDir, `dashboard-${config.transport}-${runId}.ndjson`);
const summaryPath = path.join(resultDir, `dashboard-${config.transport}-${runId}-summary.json`);
const raw = fs.createWriteStream(rawPath, { flags: 'w' });

const samples = [];
const freshness = [];
const interarrival = [];
const rtts = [];
const errors = [];
const clients = [];
let measuring = false;
let workloadStartedAt = 0;
let workloadEndedAt = 0;

try {
  console.log(`[dashboard] transport=${config.transport}, clients=${config.clients}, interval=${config.intervalMs} ms`);
  await waitForHealth();
  await setServerInterval(config.intervalMs);

  for (let i = 0; i < config.clients; i += 1) {
    clients.push(await connectClient(i));
  }
  console.log(`[dashboard] connected clients=${clients.length}`);

  await sleep(config.warmupMs);
  console.log(`[dashboard] measuring for ${config.durationMs} ms`);

  measuring = true;
  workloadStartedAt = performance.now();
  await runControlLoop(workloadStartedAt + config.durationMs);
  workloadEndedAt = performance.now();
  measuring = false;

  await sleep(config.drainMs);
  clients.forEach(c => c.close());
  writeSummary();
} catch (err) {
  console.error('[dashboard] failed:', err);
  process.exitCode = 1;
} finally {
  raw.end();
}

function parseArgs(args) {
  const out = {
    transport: env('TRANSPORT', 'websocket'),
    baseUrl: env('TARGET_BASE_URL', 'http://localhost:4005'),
    wsUrl: env('TARGET_WS_URL', ''),
    clients: intEnv('CLIENTS', 20),
    intervalMs: intEnv('INTERVAL_MS', 250),
    durationMs: intEnv('DURATION_MS', 60_000),
    warmupMs: intEnv('WARMUP_MS', 10_000),
    drainMs: intEnv('DRAIN_MS', 2_000),
    pingIntervalMs: intEnv('PING_INTERVAL_MS', 5_000),
    resultDir: env('RESULT_DIR', './results'),
    runId: env('RUN_ID', ''),
  };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--transport') out.transport = next, i += 1;
    else if (a === '--base-url') out.baseUrl = next, i += 1;
    else if (a === '--ws-url') out.wsUrl = next, i += 1;
    else if (a === '--clients') out.clients = Number(next), i += 1;
    else if (a === '--interval-ms') out.intervalMs = Number(next), i += 1;
    else if (a === '--duration-ms') out.durationMs = Number(next), i += 1;
    else if (a === '--warmup-ms') out.warmupMs = Number(next), i += 1;
    else if (a === '--drain-ms') out.drainMs = Number(next), i += 1;
    else if (a === '--ping-interval-ms') out.pingIntervalMs = Number(next), i += 1;
    else if (a === '--result-dir') out.resultDir = next, i += 1;
    else if (a === '--run-id') out.runId = next, i += 1;
  }

  out.transport = out.transport.toLowerCase();
  if (!['websocket', 'sse', 'longpolling'].includes(out.transport)) {
    throw new Error(`Unsupported dashboard transport: ${out.transport}. Available: websocket, sse, longpolling.`);
  }
  if (out.clients < 1) throw new Error('Dashboard benchmark requires at least 1 client.');
  if (out.intervalMs < 100 || out.intervalMs > 30_000) throw new Error('--interval-ms must be between 100 and 30000.');
  if (!out.wsUrl) out.wsUrl = out.baseUrl.replace(/^http/, 'ws');
  return out;
}

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

function intEnv(name, fallback) {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${config.baseUrl}/health`);
      if (res.ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Health check failed: ${config.baseUrl}/health`);
}

async function setServerInterval(intervalMs) {
  const res = await fetch(`${config.baseUrl}/api/interval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ms: intervalMs }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Unable to set dashboard interval: ${data.error || res.statusText}`);
  await sleep(Math.max(intervalMs, 250));
}

async function connectClient(index) {
  const state = {
    index,
    lastSeq: 0,
    lastReceiveAt: 0,
    received: 0,
    lost: 0,
    duplicates: 0,
    outOfOrder: 0,
    errors: 0,
    close: () => {},
    ping: async () => null,
  };

  if (config.transport === 'websocket') return connectWebSocketClient(state);
  if (config.transport === 'sse') return connectSseClient(state);
  return connectLongPollingClient(state);
}

async function connectWebSocketClient(state) {
  const ws = new WebSocket(config.wsUrl);
  ws.on('message', rawMsg => {
    try {
      const msg = JSON.parse(String(rawMsg));
      if (msg.type === 'SNAPSHOT') handleSnapshot(state, msg.data);
      if (msg.type === 'PONG' && typeof msg.timestamp === 'number') handlePong(msg.timestamp);
    } catch (err) {
      recordClientError(state, 'websocket_parse_error', err);
    }
  });
  ws.on('error', err => recordClientError(state, 'websocket_error', err));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS open timeout')), 10_000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', reject);
  });

  state.close = () => ws.close();
  state.ping = async () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
  };
  return state;
}

async function connectSseClient(state) {
  const ac = new AbortController();
  fetch(`${config.baseUrl}/stream`, { signal: ac.signal })
    .then(res => {
      if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);
      return parseSseStream(state, res.body);
    })
    .catch(err => {
      if (!ac.signal.aborted) recordClientError(state, 'sse_stream_error', err);
    });

  await waitForFirstSnapshot(state);
  state.close = () => ac.abort();
  state.ping = () => pingHttp();
  return state;
}

async function connectLongPollingClient(state) {
  let closed = false;
  let pollAbort = new AbortController();

  const initial = await fetchJsonWithRetry(`${config.baseUrl}/snapshot`);
  if (initial.snapshot) handleSnapshot(state, initial.snapshot);

  const pollLoop = async () => {
    while (!closed) {
      pollAbort = new AbortController();
      try {
        const timeout = Math.max(Math.min(config.intervalMs * 5, 30_000), 1000);
        const res = await fetch(`${config.baseUrl}/poll?since=${state.lastSeq}&timeout=${timeout}`, {
          signal: pollAbort.signal,
        });
        if (res.status === 204) continue;
        if (!res.ok) throw new Error(`Long poll failed: ${res.status}`);
        const data = await res.json();
        if (data.snapshot) handleSnapshot(state, data.snapshot);
      } catch (err) {
        if (closed) break;
        recordClientError(state, 'longpoll_error', err);
        await sleep(250);
      }
    }
  };
  pollLoop();

  state.close = () => {
    closed = true;
    pollAbort.abort();
  };
  state.ping = () => pingHttp();
  return state;
}

async function parseSseStream(state, body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let splitAt;
    while ((splitAt = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, splitAt);
      buffer = buffer.slice(splitAt + 2);
      const event = parseSseFrame(frame);
      if (event?.event === 'snapshot') handleSnapshot(state, event.data);
    }
  }
}

function parseSseFrame(frame) {
  let event = 'message';
  const data = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  return { event, data: JSON.parse(data.join('\n')) };
}

async function waitForFirstSnapshot(state) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (state.lastSeq > 0) return;
    await sleep(100);
  }
  throw new Error(`Client ${state.index} did not receive an initial snapshot.`);
}

async function fetchJsonWithRetry(url) {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      lastError = new Error(`${url} failed: ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(250);
  }
  throw lastError;
}

async function runControlLoop(deadline) {
  let nextPingAt = performance.now() + config.pingIntervalMs;
  while (performance.now() < deadline) {
    if (config.pingIntervalMs > 0 && performance.now() >= nextPingAt) {
      await Promise.all(clients.map(c => c.ping().catch(err => recordClientError(c, 'ping_error', err))));
      nextPingAt += config.pingIntervalMs;
    }
    await sleep(50);
  }
}

function handleSnapshot(state, snap) {
  if (!snap || typeof snap.sequenceId !== 'number') return;
  const receivedAt = performance.now();
  const receivedAtUnixMs = Date.now();

  if (state.lastSeq > 0) {
    if (snap.sequenceId === state.lastSeq) state.duplicates += 1;
    else if (snap.sequenceId < state.lastSeq) state.outOfOrder += 1;
    else if (snap.sequenceId > state.lastSeq + 1) state.lost += snap.sequenceId - state.lastSeq - 1;
  }

  if (measuring) {
    const freshnessMs = typeof snap.timestamp === 'number' ? receivedAtUnixMs - snap.timestamp : null;
    const interarrivalMs = state.lastReceiveAt > 0 ? receivedAt - state.lastReceiveAt : null;
    const sample = {
      runId,
      app: 'dashboard',
      transport: config.transport,
      client: state.index,
      sequenceId: snap.sequenceId,
      serverTimestampMs: snap.timestamp,
      receivedAtUnixMs,
      freshnessMs,
      interarrivalMs,
    };
    samples.push(sample);
    if (Number.isFinite(freshnessMs)) freshness.push(freshnessMs);
    if (Number.isFinite(interarrivalMs)) interarrival.push(interarrivalMs);
    raw.write(`${JSON.stringify(sample)}\n`);
  }

  state.lastSeq = Math.max(state.lastSeq, snap.sequenceId);
  state.lastReceiveAt = receivedAt;
  state.received += 1;
}

function handlePong(timestamp) {
  if (!measuring) return;
  rtts.push(Date.now() - timestamp);
}

async function pingHttp() {
  const startedAt = performance.now();
  const res = await fetch(`${config.baseUrl}/ping`);
  if (!res.ok) throw new Error(`HTTP ping failed: ${res.status}`);
  rtts.push(performance.now() - startedAt);
}

function recordClientError(state, type, err) {
  state.errors += 1;
  errors.push({ type, client: state.index, message: String(err?.message || err) });
}

function writeSummary() {
  const durationSec = Math.max((workloadEndedAt - workloadStartedAt) / 1000, 0.001);
  const expectedPerClient = config.durationMs / config.intervalMs;
  const expectedTotal = expectedPerClient * config.clients;
  const lost = clients.reduce((sum, c) => sum + c.lost, 0);
  const duplicates = clients.reduce((sum, c) => sum + c.duplicates, 0);
  const outOfOrder = clients.reduce((sum, c) => sum + c.outOfOrder, 0);

  const summary = {
    runId,
    app: 'dashboard',
    transport: config.transport,
    clients: config.clients,
    intervalMs: config.intervalMs,
    durationMs: config.durationMs,
    warmupMs: config.warmupMs,
    samples: samples.length,
    throughput: {
      targetSnapshotsPerSecPerClient: 1000 / config.intervalMs,
      expectedTotalSnapshots: expectedTotal,
      deliveredSnapshotsPerSec: samples.length / durationSec,
      deliveredSnapshotsPerSecPerClient: samples.length / durationSec / config.clients,
      deliveryRatio: expectedTotal > 0 ? samples.length / expectedTotal : null,
    },
    reliability: {
      received: samples.length,
      lostBySequenceGap: lost,
      duplicates,
      outOfOrder,
      errors: errors.length,
      clientsWithErrors: clients.filter(c => c.errors > 0).length,
    },
    latency: {
      freshnessMs: stats(freshness.sort((a, b) => a - b)),
      rttMs: stats(rtts.sort((a, b) => a - b)),
      note: 'Dashboard jest pasywnym strumieniem. freshnessMs to Date.now() klienta minus timestamp snapshotu serwera; interarrivalMs mierzy jitter dostarczania.',
    },
    interarrivalMs: stats(interarrival.sort((a, b) => a - b)),
    byClient: clients.map(c => ({
      client: c.index,
      receivedTotalIncludingWarmup: c.received,
      lastSeq: c.lastSeq,
      lostBySequenceGap: c.lost,
      duplicates: c.duplicates,
      outOfOrder: c.outOfOrder,
      errors: c.errors,
    })),
    rawPath,
    errorsPreview: errors.slice(0, 20),
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

function stats(values) {
  if (!values.length) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, avg: null };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    min: values[0],
    p50: percentile(values, 0.50),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values[values.length - 1],
    avg: sum / values.length,
  };
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
