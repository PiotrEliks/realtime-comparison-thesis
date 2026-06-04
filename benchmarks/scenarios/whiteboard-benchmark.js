import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import WebSocket from 'ws';

const { Pool } = pg;
const PASSWORD = 'password123';

const config = parseArgs(process.argv.slice(2));
const runId = config.runId || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const resultDir = path.resolve(config.resultDir);
fs.mkdirSync(resultDir, { recursive: true });

const rawPath = path.join(resultDir, `whiteboard-${config.transport}-${runId}.ndjson`);
const summaryPath = path.join(resultDir, `whiteboard-${config.transport}-${runId}-summary.json`);
const raw = fs.createWriteStream(rawPath, { flags: 'w' });

const pool = new Pool({
  host: config.dbHost,
  port: config.dbPort,
  database: config.dbName,
  user: config.dbUser,
  password: config.dbPassword,
  max: 5,
});

const pending = new Map();
const samples = [];
const errors = [];
const activeElements = [];
let seededUsers = [];
let boardId = '';
let issuedOperations = 0;
let workloadStartedAt = 0;
let workloadEndedAt = 0;

try {
  console.log(`[whiteboard] preparing data: users=${config.clients}, seed-elements=${config.seedElements}`);
  const seed = await seedWhiteboardData();
  seededUsers = seed.users;
  boardId = seed.boardId;
  activeElements.push(...seed.elements.map(el => el.data.id));

  await waitForHealth();
  const clients = await connectClients();
  console.log(`[whiteboard] connected clients=${clients.length}, board=${boardId}`);

  await sleep(config.warmupMs);
  console.log(`[whiteboard] measuring for ${config.durationMs} ms at ${config.rate} ops/s`);

  workloadStartedAt = performance.now();
  await runWorkload(clients, workloadStartedAt + config.durationMs);
  workloadEndedAt = performance.now();
  await sleep(config.drainMs);

  clients.forEach(c => c.close());
  writeSummary();
} catch (err) {
  console.error('[whiteboard] failed:', err);
  process.exitCode = 1;
} finally {
  raw.end();
  await pool.end().catch(() => {});
}

function parseArgs(args) {
  const out = {
    transport: env('TRANSPORT', 'websocket'),
    baseUrl: env('TARGET_BASE_URL', 'http://localhost:5001'),
    wsUrl: env('TARGET_WS_URL', ''),
    clients: intEnv('CLIENTS', 20),
    seedElements: intEnv('SEED_ELEMENTS', 100),
    rate: intEnv('RATE', 20),
    durationMs: intEnv('DURATION_MS', 60_000),
    warmupMs: intEnv('WARMUP_MS', 10_000),
    drainMs: intEnv('DRAIN_MS', 5_000),
    resultDir: env('RESULT_DIR', './results'),
    runId: env('RUN_ID', ''),
    dbHost: env('DB_HOST', 'localhost'),
    dbPort: intEnv('DB_PORT', 5432),
    dbName: env('WHITEBOARD_DB', 'realtime_whiteboard'),
    dbUser: env('DB_USER', 'thesis_user'),
    dbPassword: env('DB_PASSWORD', 'thesis_password'),
  };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--transport') out.transport = next, i += 1;
    else if (a === '--base-url') out.baseUrl = next, i += 1;
    else if (a === '--ws-url') out.wsUrl = next, i += 1;
    else if (a === '--clients') out.clients = Number(next), i += 1;
    else if (a === '--seed-elements') out.seedElements = Number(next), i += 1;
    else if (a === '--rate') out.rate = Number(next), i += 1;
    else if (a === '--duration-ms') out.durationMs = Number(next), i += 1;
    else if (a === '--warmup-ms') out.warmupMs = Number(next), i += 1;
    else if (a === '--drain-ms') out.drainMs = Number(next), i += 1;
    else if (a === '--result-dir') out.resultDir = next, i += 1;
    else if (a === '--run-id') out.runId = next, i += 1;
  }

  out.transport = out.transport.toLowerCase();
  if (!['websocket', 'sse', 'longpolling'].includes(out.transport)) {
    throw new Error(`Unsupported whiteboard transport: ${out.transport}.`);
  }
  if (out.clients < 2) throw new Error('Whiteboard benchmark requires at least 2 clients.');
  if (!out.wsUrl) out.wsUrl = `${out.baseUrl.replace(/^http/, 'ws').replace(':5001', ':5002')}`;
  return out;
}

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

function intEnv(name, fallback) {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

async function seedWhiteboardData() {
  const client = await pool.connect();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users = [];
  const elements = Array.from({ length: config.seedElements }, (_, i) => shapeElement(`seed-${i}`, seededShape(i)));

  try {
    await client.query('BEGIN');
    await ensureWhiteboardSchema(client);
    await client.query("DELETE FROM board_members WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'bench_whiteboard_user_%')");
    await client.query("DELETE FROM boards WHERE name LIKE 'Benchmark Whiteboard %'");
    await client.query("DELETE FROM users WHERE username LIKE 'bench_whiteboard_user_%'");

    for (let i = 0; i < config.clients; i += 1) {
      const n = String(i + 1).padStart(4, '0');
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO users (id, username, email, password_hash, display_name, cursor_color, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [id, `bench_whiteboard_user_${n}`, `bench_whiteboard_user_${n}@whiteboard.local`, passwordHash, `Bench Whiteboard User ${n}`, colorFor(i)],
      );
      users.push({ id, username: `bench_whiteboard_user_${n}` });
    }

    const createdBoardId = crypto.randomUUID();
    await client.query(
      `INSERT INTO boards (id, name, description, elements, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW(), NOW())`,
      [createdBoardId, `Benchmark Whiteboard ${runId}`, 'Automated benchmark board', JSON.stringify(elements), users[0].id],
    );

    for (const [idx, user] of users.entries()) {
      await client.query(
        `INSERT INTO board_members (id, board_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [crypto.randomUUID(), createdBoardId, user.id, idx === 0 ? 'owner' : 'editor'],
      );
    }

    await client.query('COMMIT');
    return { users, boardId: createdBoardId, elements };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function ensureWhiteboardSchema(client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(100),
      avatar_url VARCHAR(500),
      cursor_color VARCHAR(7),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS boards (
      id UUID PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      elements JSONB NOT NULL DEFAULT '[]',
      thumbnail TEXT,
      created_by UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE board_role AS ENUM ('owner', 'editor', 'viewer');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS board_members (
      id UUID PRIMARY KEY,
      board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      role board_role NOT NULL DEFAULT 'editor',
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(board_id, user_id)
    )
  `);
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

async function connectClients() {
  const clients = [];
  for (let i = 0; i < config.clients; i += 1) {
    const user = seededUsers[i];
    if (config.transport === 'websocket') clients.push(await connectWebSocketClient(i, user));
    else if (config.transport === 'sse') clients.push(await connectSseClient(i, user));
    else clients.push(await connectLongPollingClient(i, user));
  }
  return clients;
}

async function connectWebSocketClient(index, user) {
  const ws = new WebSocket(`${config.wsUrl}?token=${encodeURIComponent(user.id)}`);
  ws.on('message', rawMsg => {
    try { handleEvent(index, JSON.parse(String(rawMsg))); }
    catch (err) { errors.push({ type: 'parse_error', transport: 'websocket', message: String(err) }); }
  });
  ws.on('error', err => errors.push({ type: 'websocket_error', client: index, message: String(err.message || err) }));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS open timeout')), 10_000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', reject);
  });
  await waitForMessage('CONNECTED', index);

  ws.send(JSON.stringify({ type: 'BOARD_JOINED', payload: { boardId }, timestamp: Date.now() }));
  await waitForMessage('BOARD_STATE', index);

  return {
    index,
    user,
    send: message => ws.send(JSON.stringify(message)),
    api: () => Promise.reject(new Error('WebSocket client does not use REST API operations')),
    close: () => ws.close(),
  };
}

async function connectSseClient(index, user) {
  const ac = new AbortController();
  fetch(`${config.baseUrl}/events?token=${encodeURIComponent(user.id)}`, { signal: ac.signal })
    .then(res => {
      if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);
      return parseSseStream(index, res.body);
    })
    .catch(err => {
      if (!ac.signal.aborted) errors.push({ type: 'sse_stream_error', client: index, message: String(err.message || err) });
    });

  await waitForMessage('CONNECTED', index);
  const joined = waitForMessage('BOARD_STATE', index);
  await api(user.id, '/api/me/board', 'PATCH', { boardId });
  await joined;

  return {
    index,
    user,
    send: () => Promise.reject(new Error('SSE client sends operations via REST API')),
    api: (route, method, body) => api(user.id, route, method, body),
    close: () => ac.abort(),
  };
}

async function connectLongPollingClient(index, user) {
  let closed = false;
  let pollAbort = new AbortController();

  const pollLoop = async () => {
    while (!closed) {
      pollAbort = new AbortController();
      try {
        const res = await fetch(`${config.baseUrl}/poll?timeout=25000`, {
          headers: { Authorization: `Bearer ${user.id}` },
          signal: pollAbort.signal,
        });
        if (res.status === 204) continue;
        if (!res.ok) throw new Error(`Long poll failed: ${res.status}`);
        const data = await res.json();
        for (const event of data.events || []) {
          handleEvent(index, { type: event.type, payload: event.payload, timestamp: event.timestamp });
        }
      } catch (err) {
        if (closed) break;
        errors.push({ type: 'longpoll_error', client: index, message: String(err.message || err) });
        await sleep(250);
      }
    }
  };
  pollLoop();

  const joined = waitForMessage('BOARD_STATE', index);
  await api(user.id, '/api/me/board', 'PATCH', { boardId });
  await joined;

  return {
    index,
    user,
    send: () => Promise.reject(new Error('Long polling client sends operations via REST API')),
    api: (route, method, body) => api(user.id, route, method, body),
    close: () => {
      closed = true;
      pollAbort.abort();
    },
  };
}

async function parseSseStream(index, body) {
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
      if (event) handleEvent(index, event);
    }
  }
}

function parseSseFrame(frame) {
  const data = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  return JSON.parse(data.join('\n'));
}

async function api(token, route, method, body) {
  const res = await fetch(`${config.baseUrl}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`${method} ${route} failed: ${data.error || res.statusText}`);
  }
  return res.json().catch(() => ({}));
}

function waitForMessage(type, clientIndex) {
  return new Promise((resolve, reject) => {
    const id = `system:${clientIndex}:${type}:${crypto.randomUUID()}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for ${type} on client ${clientIndex}`));
    }, 20_000);
    pending.set(id, { systemType: type, clientIndex, resolve, timer });
  });
}

async function runWorkload(clients, deadline) {
  const intervalMs = 1000 / config.rate;
  let opIndex = 0;
  while (performance.now() < deadline) {
    const client = clients[opIndex % clients.length];
    await issueOperation(client, opIndex).catch(err => {
      errors.push({ type: 'send_error', message: String(err) });
    });
    issuedOperations += 1;
    opIndex += 1;
    await sleep(intervalMs);
  }
}

async function issueOperation(client, opIndex) {
  const pattern = ['draw', 'shape', 'cursor', 'update', 'delete'];
  const op = pattern[opIndex % pattern.length];
  if (op === 'draw') return issueDraw(client, opIndex);
  if (op === 'shape') return issueShape(client, opIndex);
  if (op === 'cursor') return issueCursor(client, opIndex);
  if (op === 'update') return issueUpdate(client, opIndex);
  return issueDelete(client, opIndex);
}

function issueDraw(client, opIndex) {
  const id = operationId('draw', opIndex);
  const element = pathElement(id, client.user.id, opIndex);
  activeElements.push(id);
  expectBroadcast({ op: 'draw', messageId: id, senderClient: client.index, match: event => event.type === 'DRAW_END' && event.payload?.element?.data?.id === id });
  if (config.transport === 'websocket') {
    client.send({ type: 'DRAW_END', payload: { boardId, element }, timestamp: Date.now() });
    return;
  }
  return client.api('/api/draw-end', 'POST', { boardId, element });
}

function issueShape(client, opIndex) {
  const id = operationId('shape', opIndex);
  const element = shapeElement(id, { ...seededShape(opIndex), userId: client.user.id, timestamp: Date.now() });
  activeElements.push(id);
  expectBroadcast({ op: 'shape', messageId: id, senderClient: client.index, match: event => event.type === 'ELEMENT_ADD' && event.payload?.data?.id === id });
  if (config.transport === 'websocket') {
    client.send({ type: 'ELEMENT_ADD', payload: element, timestamp: Date.now() });
    return;
  }
  return client.api('/api/elements', 'POST', { boardId, element });
}

function issueCursor(client, opIndex) {
  const marker = 100000 + opIndex;
  const id = operationId('cursor', opIndex);
  expectBroadcast({ op: 'cursor', messageId: id, senderClient: client.index, match: event => event.type === 'CURSOR_MOVE' && event.payload?.x === marker });
  const payload = { x: marker, y: 200 + (opIndex % 500), tool: 'pen' };
  if (config.transport === 'websocket') {
    client.send({ type: 'CURSOR_MOVE', payload, timestamp: Date.now() });
    return;
  }
  return client.api('/api/cursor', 'POST', { boardId, ...payload });
}

function issueUpdate(client, opIndex) {
  if (!activeElements.length) return issueShape(client, opIndex);
  const elementId = activeElements[opIndex % activeElements.length];
  const id = operationId('update', opIndex);
  const changes = { data: { id: elementId, x: 50 + (opIndex % 700), y: 80 + (opIndex % 400), color: '#1D4ED8', strokeWidth: 3, userId: client.user.id, timestamp: Date.now() } };
  expectBroadcast({ op: 'update', messageId: id, senderClient: client.index, match: event => event.type === 'ELEMENT_UPDATE' && event.payload?.elementId === elementId });
  if (config.transport === 'websocket') {
    client.send({ type: 'ELEMENT_UPDATE', payload: { elementId, changes }, timestamp: Date.now() });
    return;
  }
  return client.api(`/api/elements/${elementId}`, 'PATCH', { boardId, changes });
}

function issueDelete(client, opIndex) {
  if (activeElements.length < 10) return issueShape(client, opIndex);
  const elementId = activeElements.shift();
  const id = operationId('delete', opIndex);
  expectBroadcast({ op: 'delete', messageId: id, senderClient: client.index, match: event => event.type === 'ELEMENT_DELETE' && event.payload?.elementId === elementId });
  if (config.transport === 'websocket') {
    client.send({ type: 'ELEMENT_DELETE', payload: { elementId }, timestamp: Date.now() });
    return;
  }
  return client.api(`/api/elements/${elementId}`, 'DELETE', { boardId });
}

function expectBroadcast(item) {
  pending.set(item.messageId, {
    ...item,
    sentAt: performance.now(),
  });
}

function handleEvent(clientIndex, event) {
  for (const [key, item] of pending) {
    if (item.systemType) {
      if (item.clientIndex === clientIndex && item.systemType === event.type) {
        clearTimeout(item.timer);
        pending.delete(key);
        item.resolve(event);
      }
      continue;
    }

    if (item.senderClient === clientIndex) continue;
    if (!item.match(event)) continue;

    const receivedAt = performance.now();
    const latencyMs = receivedAt - item.sentAt;
    const sample = {
      runId,
      app: 'whiteboard',
      transport: config.transport,
      op: item.op,
      messageId: item.messageId,
      receiverClient: clientIndex,
      latencyMs,
      receivedAtUnixMs: Date.now(),
    };
    samples.push(sample);
    raw.write(`${JSON.stringify(sample)}\n`);
    pending.delete(key);
    break;
  }

  if (event.type === 'ERROR') {
    errors.push({ type: 'server_error', client: clientIndex, payload: event.payload });
  }
}

function operationId(op, opIndex) {
  return `${runId}-${op}-${opIndex}-${crypto.randomUUID()}`;
}

function pathElement(id, userId, i) {
  return {
    type: 'path',
    data: {
      id,
      points: [
        { x: 10 + (i % 500), y: 20 + (i % 300), pressure: 0.5 },
        { x: 20 + (i % 500), y: 30 + (i % 300), pressure: 0.6 },
        { x: 30 + (i % 500), y: 35 + (i % 300), pressure: 0.7 },
      ],
      color: '#111827',
      strokeWidth: 2,
      tool: 'pen',
      userId,
      timestamp: Date.now(),
    },
  };
}

function shapeElement(id, data) {
  return {
    type: 'shape',
    data: {
      id,
      type: 'rectangle',
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      color: data.color,
      strokeWidth: data.strokeWidth,
      filled: false,
      userId: data.userId || 'seed',
      timestamp: data.timestamp || Date.now(),
    },
  };
}

function seededShape(i) {
  return {
    x: 40 + (i % 20) * 30,
    y: 40 + Math.floor(i / 20) * 30,
    width: 24,
    height: 18,
    color: '#0F766E',
    strokeWidth: 2,
  };
}

function colorFor(i) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
  return colors[i % colors.length];
}

function writeSummary() {
  const latencies = samples.map(s => s.latencyMs).sort((a, b) => a - b);
  const activePending = [...pending.values()].filter(x => !x.systemType).length;
  const durationSec = Math.max((workloadEndedAt - workloadStartedAt) / 1000, 0.001);
  const byOp = {};

  for (const sample of samples) {
    byOp[sample.op] ??= [];
    byOp[sample.op].push(sample.latencyMs);
  }

  const summary = {
    runId,
    app: 'whiteboard',
    transport: config.transport,
    clients: config.clients,
    seedElements: config.seedElements,
    rate: config.rate,
    durationMs: config.durationMs,
    warmupMs: config.warmupMs,
    samples: samples.length,
    issuedOperations,
    pending: activePending,
    errors: errors.length,
    throughput: {
      targetOpsPerSec: config.rate,
      actualOpsPerSec: issuedOperations / durationSec,
      deliveredEventsPerSec: samples.length / durationSec,
    },
    reliability: {
      sent: issuedOperations,
      delivered: samples.length,
      lostOrUnmatched: Math.max(issuedOperations - samples.length - activePending, 0),
      pending: activePending,
      errors: errors.length,
    },
    latency: stats(latencies),
    byOp: Object.fromEntries(Object.entries(byOp).map(([op, values]) => [op, stats(values.sort((a, b) => a - b))])),
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
