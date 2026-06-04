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

const rawPath = path.join(resultDir, `chat-${config.transport}-${runId}.ndjson`);
const summaryPath = path.join(resultDir, `chat-${config.transport}-${runId}-summary.json`);
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
let seededUsers = [];
let roomId = '';
let issuedOperations = 0;
let workloadStartedAt = 0;
let workloadEndedAt = 0;

try {
  console.log(`[chat] preparing data: users=${config.clients}`);
  const seed = await seedChatData();
  seededUsers = seed.users;
  roomId = seed.roomId;

  console.log(`[chat] room=${roomId}, transport=${config.transport}`);
  if (config.seedOnly) process.exit(0);

  await waitForHealth();
  const clients = await connectClients();
  console.log(`[chat] connected clients=${clients.length}`);

  await sleep(config.warmupMs);
  console.log(`[chat] measuring for ${config.durationMs} ms at ${config.rate} msg/s`);

  workloadStartedAt = performance.now();
  await runWorkload(clients, workloadStartedAt + config.durationMs);
  workloadEndedAt = performance.now();
  await sleep(config.drainMs);

  clients.forEach(c => c.close());
  writeSummary();
} catch (err) {
  console.error('[chat] failed:', err);
  process.exitCode = 1;
} finally {
  raw.end();
  await pool.end().catch(() => {});
}

function parseArgs(args) {
  const out = {
    transport: env('TRANSPORT', 'websocket'),
    baseUrl: env('TARGET_BASE_URL', 'http://localhost:4001'),
    wsUrl: env('TARGET_WS_URL', ''),
    clients: intEnv('CLIENTS', 20),
    rate: intEnv('RATE', 10),
    durationMs: intEnv('DURATION_MS', 60_000),
    warmupMs: intEnv('WARMUP_MS', 10_000),
    drainMs: intEnv('DRAIN_MS', 5_000),
    resultDir: env('RESULT_DIR', './results'),
    runId: env('RUN_ID', ''),
    seedOnly: false,
    dbHost: env('DB_HOST', 'localhost'),
    dbPort: intEnv('DB_PORT', 5432),
    dbName: env('DB_NAME', 'realtime_chat'),
    dbUser: env('DB_USER', 'thesis_user'),
    dbPassword: env('DB_PASSWORD', 'thesis_password'),
  };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--seed-only') out.seedOnly = true;
    else if (a === '--transport') out.transport = next, i += 1;
    else if (a === '--base-url') out.baseUrl = next, i += 1;
    else if (a === '--ws-url') out.wsUrl = next, i += 1;
    else if (a === '--clients') out.clients = Number(next), i += 1;
    else if (a === '--rate') out.rate = Number(next), i += 1;
    else if (a === '--duration-ms') out.durationMs = Number(next), i += 1;
    else if (a === '--warmup-ms') out.warmupMs = Number(next), i += 1;
    else if (a === '--result-dir') out.resultDir = next, i += 1;
    else if (a === '--run-id') out.runId = next, i += 1;
  }

  out.transport = out.transport.toLowerCase();
  if (!['websocket', 'sse', 'longpolling'].includes(out.transport)) {
    throw new Error(`Unsupported chat transport: ${out.transport}. Available: websocket, sse, longpolling.`);
  }
  if (out.clients < 2) throw new Error('Chat benchmark requires at least 2 clients.');
  if (!out.wsUrl) out.wsUrl = `${out.baseUrl.replace(/^http/, 'ws')}/ws`;
  return out;
}

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

function intEnv(name, fallback) {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

async function seedChatData() {
  const client = await pool.connect();
  const users = [];
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  try {
    await client.query('BEGIN');
    await ensureChatSchema(client);
    await client.query("DELETE FROM rooms WHERE name = 'Benchmark Chat Room'");
    await client.query("DELETE FROM users WHERE username LIKE 'bench_chat_user_%'");

    for (let i = 0; i < config.clients; i += 1) {
      const n = String(i + 1).padStart(4, '0');
      const res = await client.query(
        `INSERT INTO users (username, email, password_hash, display_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'offline', NOW(), NOW())
         RETURNING id, username`,
        [`bench_chat_user_${n}`, `bench_chat_user_${n}@chat.local`, passwordHash, `Bench Chat User ${n}`],
      );
      users.push(res.rows[0]);
    }

    const room = await client.query(
      `INSERT INTO rooms (name, type, created_by, created_at, updated_at)
       VALUES ('Benchmark Chat Room', 'group', $1, NOW(), NOW())
       RETURNING id`,
      [users[0].id],
    );
    const createdRoomId = room.rows[0].id;

    for (const [idx, user] of users.entries()) {
      await client.query(
        `INSERT INTO room_members (room_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [createdRoomId, user.id, idx === 0 ? 'admin' : 'member'],
      );
    }

    await client.query('COMMIT');
    return { users, roomId: createdRoomId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function ensureChatSchema(client) {
  await client.query(`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS file_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS file_size INTEGER,
      ADD COLUMN IF NOT EXISTS file_mime_type VARCHAR(100)
  `);
}

async function waitForHealth() {
  const endpoint = config.transport === 'websocket' ? '/api/health' : '/health';
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${config.baseUrl}${endpoint}`);
      if (res.ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Health check failed: ${config.baseUrl}${endpoint}`);
}

async function connectClients() {
  const clients = [];
  for (let i = 0; i < config.clients; i += 1) {
    const token = await login(seededUsers[i].username);
    const client = config.transport === 'websocket'
      ? await connectWebSocketClient(i, token)
      : config.transport === 'sse'
        ? await connectSseClient(i, token)
        : await connectLongPollingClient(i, token);
    clients.push(client);
  }
  return clients;
}

async function login(username) {
  const res = await fetch(`${config.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Login failed for ${username}: ${data.error || res.statusText}`);
  return data.token;
}

async function connectWebSocketClient(index, token) {
  const ws = new WebSocket(`${config.wsUrl}?token=${encodeURIComponent(token)}`);
  ws.on('message', rawMsg => {
    try { handleEvent(index, JSON.parse(String(rawMsg))); }
    catch (err) { errors.push({ type: 'parse_error', transport: 'websocket', message: String(err) }); }
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS open timeout')), 10_000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', reject);
  });

  await waitForMessage('CONNECTED', index);

  return {
    index,
    sendMessage: content => ws.send(JSON.stringify({ type: 'SEND_MESSAGE', payload: { roomId, content } })),
    close: () => ws.close(),
  };
}

async function connectSseClient(index, token) {
  const ac = new AbortController();
  const connected = waitForMessage('CONNECTED', index);

  fetch(`${config.baseUrl}/sse?token=${encodeURIComponent(token)}`, { signal: ac.signal })
    .then(res => {
      if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);
      return parseSseStream(index, res.body);
    })
    .catch(err => {
      if (!ac.signal.aborted) errors.push({ type: 'sse_stream_error', message: String(err) });
    });

  await connected;

  return {
    index,
    sendMessage: content => api(token, '/api/messages', 'POST', { roomId, content }),
    close: () => ac.abort(),
  };
}

async function connectLongPollingClient(index, token) {
  let closed = false;
  let lastEventId = 0;
  let pollAbort = new AbortController();
  const connected = waitForMessage('CONNECTED', index);

  const pollLoop = async () => {
    while (!closed) {
      pollAbort = new AbortController();
      try {
        const res = await fetch(`${config.baseUrl}/api/poll?token=${encodeURIComponent(token)}&lastEventId=${lastEventId}`, {
          signal: pollAbort.signal,
        });
        if (!res.ok) throw new Error(`Long poll failed: ${res.status}`);
        const data = await res.json();
        if (typeof data.lastEventId === 'number') lastEventId = data.lastEventId;
        for (const item of data.events || []) {
          handleEvent(index, { type: item.type, payload: item.payload });
        }
      } catch (err) {
        if (closed) break;
        errors.push({ type: 'longpoll_error', message: String(err) });
        await sleep(500);
      }
    }
  };
  pollLoop();

  await connected;

  return {
    index,
    sendMessage: content => api(token, '/api/messages', 'POST', { roomId, content }),
    close: () => {
      closed = true;
      pollAbort.abort();
    },
  };
}

async function api(token, route, method, body) {
  const res = await fetch(`${config.baseUrl}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`${method} ${route} failed: ${data.error || res.statusText}`);
  }
  return res.json();
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
  let eventName = 'message';
  const data = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  return { type: eventName, payload: JSON.parse(data.join('\n')) };
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
    await issueMessage(client, opIndex).catch(err => {
      errors.push({ type: 'send_error', message: String(err) });
    });
    issuedOperations += 1;
    opIndex += 1;
    await sleep(intervalMs);
  }
}

async function issueMessage(client, opIndex) {
  const messageId = `${runId}-${opIndex}-${crypto.randomUUID()}`;
  const sentAt = performance.now();
  pending.set(messageId, {
    messageId,
    op: 'message',
    sentAt,
    senderClient: client.index,
    match: event => event.type === 'NEW_MESSAGE' && event.payload?.content?.includes(messageId),
  });
  await client.sendMessage(`BENCH-CHAT ${messageId}`);
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
      app: 'chat',
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
}

function writeSummary() {
  const latencies = samples.map(s => s.latencyMs).sort((a, b) => a - b);
  const activePending = [...pending.values()].filter(x => !x.systemType).length;
  const durationSec = Math.max((workloadEndedAt - workloadStartedAt) / 1000, 0.001);
  const summary = {
    runId,
    app: 'chat',
    transport: config.transport,
    clients: config.clients,
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
