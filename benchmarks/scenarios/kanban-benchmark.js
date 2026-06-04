import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import WebSocket from 'ws';

const { Pool } = pg;

const PASSWORD = 'password123';
const STATUSES = ['new', 'todo', 'to_fix', 'verification', 'fixed', 'to_merge', 'committed', 'to_deploy', 'done'];

const config = parseArgs(process.argv.slice(2));
const runId = config.runId || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const resultDir = path.resolve(config.resultDir);
fs.mkdirSync(resultDir, { recursive: true });

const rawPath = path.join(resultDir, `kanban-${config.transport}-${runId}.ndjson`);
const summaryPath = path.join(resultDir, `kanban-${config.transport}-${runId}-summary.json`);
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

let projectId = '';
let seededUsers = [];
let seededTasks = [];
let issuedOperations = 0;
let workloadStartedAt = 0;
let workloadEndedAt = 0;

try {
  console.log(`[kanban] preparing data: users=${config.clients}, tasks=${config.seedTasks}`);
  const seed = await seedKanbanData();
  projectId = seed.projectId;
  seededUsers = seed.users;
  seededTasks = seed.tasks;

  console.log(`[kanban] project=${projectId}, transport=${config.transport}`);
  if (config.seedOnly) {
    console.log('[kanban] seed-only finished');
    process.exit(0);
  }

  await waitForHealth();
  const clients = await connectClients();
  console.log(`[kanban] connected clients=${clients.length}`);

  await sleep(config.warmupMs);
  console.log(`[kanban] measuring for ${config.durationMs} ms at ${config.rate} ops/s`);

  workloadStartedAt = performance.now();
  await runWorkload(clients, workloadStartedAt + config.durationMs);
  workloadEndedAt = performance.now();
  await sleep(config.drainMs);

  clients.forEach(c => c.close());
  writeSummary();
} catch (err) {
  console.error('[kanban] failed:', err);
  process.exitCode = 1;
} finally {
  raw.end();
  await pool.end().catch(() => {});
}

function parseArgs(args) {
  const out = {
    transport: env('TRANSPORT', 'websocket'),
    baseUrl: env('TARGET_BASE_URL', 'http://localhost:4010'),
    wsUrl: env('TARGET_WS_URL', ''),
  clients: intEnv('CLIENTS', 20),
    seedTasks: intEnv('SEED_TASKS', 200),
    rate: intEnv('RATE', 10),
    durationMs: intEnv('DURATION_MS', 60_000),
    warmupMs: intEnv('WARMUP_MS', 10_000),
    drainMs: intEnv('DRAIN_MS', 5_000),
    resultDir: env('RESULT_DIR', './results'),
    runId: env('RUN_ID', ''),
    seedOnly: false,
    dbHost: env('DB_HOST', 'localhost'),
    dbPort: intEnv('DB_PORT', 5432),
    dbName: env('KANBAN_DB', 'realtime_kanban'),
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
    else if (a === '--seed-tasks') out.seedTasks = Number(next), i += 1;
    else if (a === '--rate') out.rate = Number(next), i += 1;
    else if (a === '--duration-ms') out.durationMs = Number(next), i += 1;
    else if (a === '--warmup-ms') out.warmupMs = Number(next), i += 1;
    else if (a === '--result-dir') out.resultDir = next, i += 1;
    else if (a === '--run-id') out.runId = next, i += 1;
  }

  out.transport = out.transport.toLowerCase();
  if (!['websocket', 'sse', 'longpolling'].includes(out.transport)) {
    throw new Error(`Unsupported Kanban transport: ${out.transport}. Available: websocket, sse, longpolling.`);
  }
  if (out.clients < 2) {
    throw new Error('Kanban benchmark requires at least 2 clients to measure propagation latency.');
  }
  if (!out.wsUrl) out.wsUrl = out.baseUrl.replace(/^http/, 'ws');
  return out;
}

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

function intEnv(name, fallback) {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

async function seedKanbanData() {
  const client = await pool.connect();
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users = [];
  const tasks = [];

  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM projects WHERE key = 'BENCH'");
    await client.query("DELETE FROM users WHERE username LIKE 'bench_user_%'");

    for (let i = 0; i < config.clients; i += 1) {
      const n = String(i + 1).padStart(4, '0');
      const res = await client.query(
        `INSERT INTO users (username, email, password_hash, display_name, color, role)
         VALUES ($1, $2, $3, $4, $5, 'member')
         RETURNING id, username`,
        [`bench_user_${n}`, `bench_user_${n}@kanban.local`, passwordHash, `Bench User ${n}`, colors[i % colors.length]]
      );
      users.push(res.rows[0]);
    }

    const project = await client.query(
      `INSERT INTO projects (name, key, description, created_by)
       VALUES ('Benchmark Kanban Project', 'BENCH', 'Synthetic benchmark data', $1)
       RETURNING id`,
      [users[0].id]
    );
    const createdProjectId = project.rows[0].id;

    for (const user of users) {
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [createdProjectId, user.id, user === users[0] ? 'owner' : 'member']
      );
    }

    for (let i = 0; i < config.seedTasks; i += 1) {
      const status = STATUSES[i % STATUSES.length];
      const assignee = users[i % users.length];
      const reporter = users[(i + 1) % users.length];
      const res = await client.query(
        `INSERT INTO tasks
          (project_id, task_number, title, description, status, priority, type, assignee_id, reporter_id, tags, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, title, status`,
        [
          createdProjectId,
          i + 1,
          `BENCH-TASK-${String(i + 1).padStart(5, '0')}`,
          'Synthetic task used by the Kanban benchmark',
          status,
          ['low', 'medium', 'high', 'critical'][i % 4],
          ['task', 'bug', 'feature', 'improvement'][i % 4],
          assignee.id,
          reporter.id,
          ['benchmark', `status:${status}`],
          Math.floor(i / STATUSES.length),
        ]
      );
      tasks.push(res.rows[0]);
    }

    await client.query('COMMIT');
    return { projectId: createdProjectId, users, tasks };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
    const username = seededUsers[i].username;
    const token = await login(username);
    const client = config.transport === 'websocket'
      ? await connectWebSocketClient(i, token)
    : await connectHttpPullClient(i, token);
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
  const ws = new WebSocket(config.wsUrl);

  ws.on('message', rawMsg => {
    try {
      handleEvent(index, JSON.parse(String(rawMsg)));
    } catch (err) {
      errors.push({ type: 'parse_error', transport: 'websocket', message: String(err) });
    }
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS open timeout')), 10_000);
    ws.once('open', () => {
      clearTimeout(timer);
      ws.send(JSON.stringify({ type: 'AUTH', token }));
      resolve();
    });
    ws.once('error', reject);
  });

  await waitForMessage('AUTHENTICATED', index, () => {});
  ws.send(JSON.stringify({ type: 'SELECT_PROJECT', projectId }));
  await waitForMessage('PROJECT_LOADED', index, () => {});

  return {
    index,
    sendCreate: data => ws.send(JSON.stringify({ type: 'CREATE_TASK', data })),
    sendUpdate: (taskId, changes) => ws.send(JSON.stringify({ type: 'UPDATE_TASK', taskId, changes })),
    sendMove: (taskId, newStatus, position) => ws.send(JSON.stringify({ type: 'MOVE_TASK', taskId, newStatus, position })),
    sendComment: (taskId, content) => ws.send(JSON.stringify({ type: 'ADD_COMMENT', taskId, content })),
    close: () => ws.close(),
  };
}

async function connectSseClient(index, token) {
  const ac = new AbortController();
  const streamReady = waitForMessage('connected', index, () => {});
  const projectReady = waitForMessage('project_loaded', index, () => {});

  fetch(`${config.baseUrl}/events?token=${encodeURIComponent(token)}`, { signal: ac.signal })
    .then(res => {
      if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);
      return parseSseStream(index, res.body);
    })
    .catch(err => {
      if (!ac.signal.aborted) errors.push({ type: 'sse_stream_error', message: String(err) });
    });

  await streamReady;
  await api(token, '/api/me/project', 'PATCH', { projectId });
  await projectReady;

  return {
    index,
    sendCreate: data => api(token, '/api/tasks', 'POST', { projectId, ...data }),
    sendUpdate: (taskId, changes) => api(token, `/api/tasks/${taskId}`, 'PATCH', { projectId, ...changes }),
    sendMove: (taskId, newStatus, position) => api(token, `/api/tasks/${taskId}/move`, 'POST', { projectId, newStatus, position }),
    sendComment: (taskId, content) => api(token, `/api/tasks/${taskId}/comments`, 'POST', { projectId, content }),
    close: () => ac.abort(),
  };
}

async function connectLongPollingClient(index, token) {
  let closed = false;
  let pollAbort = new AbortController();

  await api(token, '/api/me/project', 'PATCH', { projectId });

  const pollLoop = async () => {
    while (!closed) {
      pollAbort = new AbortController();
      try {
        const res = await fetch(`${config.baseUrl}/poll?timeout=25000`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: pollAbort.signal,
        });
        if (res.status === 204) continue;
        if (!res.ok) throw new Error(`Long poll failed: ${res.status}`);
        const data = await res.json();
        for (const item of data.events || []) {
          handleEvent(index, { type: item.event, ...item.data });
        }
      } catch (err) {
        if (closed) break;
        errors.push({ type: 'longpoll_error', message: String(err) });
        await sleep(500);
      }
    }
  };

  pollLoop();

  return {
    index,
    sendCreate: data => api(token, '/api/tasks', 'POST', { projectId, ...data }),
    sendUpdate: (taskId, changes) => api(token, `/api/tasks/${taskId}`, 'PATCH', { projectId, ...changes }),
    sendMove: (taskId, newStatus, position) => api(token, `/api/tasks/${taskId}/move`, 'POST', { projectId, newStatus, position }),
    sendComment: (taskId, content) => api(token, `/api/tasks/${taskId}/comments`, 'POST', { projectId, content }),
    close: () => {
      closed = true;
      pollAbort.abort();
    },
  };
}

async function connectHttpPullClient(index, token) {
  if (config.transport === 'sse') return connectSseClient(index, token);
  return connectLongPollingClient(index, token);
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
  return { type: eventName, ...JSON.parse(data.join('\n')) };
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
    const op = ['create', 'move', 'update', 'comment'][opIndex % 4];
    await issueOperation(client, op, opIndex).catch(err => {
      errors.push({ type: 'send_error', op, message: String(err) });
    });
    opIndex += 1;
    issuedOperations += 1;
    await sleep(intervalMs);
  }
}

async function issueOperation(client, op, opIndex) {
  const messageId = `${runId}-${opIndex}-${crypto.randomUUID()}`;
  const sentAt = performance.now();
  const task = seededTasks[opIndex % seededTasks.length];
  const nextStatus = STATUSES[(opIndex + 3) % STATUSES.length];

  if (op === 'create') {
    pending.set(messageId, { messageId, op, sentAt, senderClient: client.index, match: event => {
      const title = event.task?.title;
      return isEvent(event, 'TASK_CREATED', 'task_created') && title?.includes(messageId);
    }});
    await client.sendCreate({
      title: `BENCH-CREATE ${messageId}`,
      description: 'Created by benchmark workload',
      status: 'new',
      priority: 'medium',
      type: 'task',
      tags: ['benchmark', messageId],
    });
    return;
  }

  if (op === 'move') {
    pending.set(messageId, { messageId, op, sentAt, senderClient: client.index, match: event => {
      return isEvent(event, 'TASK_MOVED', 'task_moved')
        && event.taskId === task.id
        && (event.newStatus === nextStatus || event.task?.status === nextStatus);
    }});
    await client.sendMove(task.id, nextStatus, opIndex);
    return;
  }

  if (op === 'update') {
    pending.set(messageId, { messageId, op, sentAt, senderClient: client.index, match: event => {
      return isEvent(event, 'TASK_UPDATED', 'task_updated')
        && event.task?.id === task.id
        && event.task?.description?.includes(messageId);
    }});
    await client.sendUpdate(task.id, { description: `Benchmark update ${messageId}` });
    return;
  }

  pending.set(messageId, { messageId, op, sentAt, senderClient: client.index, match: event => {
    return isEvent(event, 'COMMENT_ADDED', 'comment_added')
      && event.taskId === task.id
      && event.comment?.content?.includes(messageId);
  }});
  await client.sendComment(task.id, `Benchmark comment ${messageId}`);
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

    if (item.match(event)) {
      const receivedAt = performance.now();
      const latencyMs = receivedAt - item.sentAt;
      const sample = {
        runId,
        app: 'kanban',
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
}

function isEvent(event, wsType, sseType) {
  return event.type === wsType || event.type === sseType;
}

function writeSummary() {
  const latencies = samples.map(s => s.latencyMs).sort((a, b) => a - b);
  const byOp = Object.fromEntries(['create', 'move', 'update', 'comment'].map(op => {
    const values = samples.filter(s => s.op === op).map(s => s.latencyMs).sort((a, b) => a - b);
    return [op, stats(values)];
  }));

  const summary = {
    runId,
    app: 'kanban',
    transport: config.transport,
    clients: config.clients,
    seedTasks: config.seedTasks,
    rate: config.rate,
    durationMs: config.durationMs,
    warmupMs: config.warmupMs,
    samples: samples.length,
    issuedOperations,
    pending: [...pending.values()].filter(x => !x.systemType).length,
    errors: errors.length,
    throughput: {
      targetOpsPerSec: config.rate,
      actualOpsPerSec: issuedOperations / Math.max((workloadEndedAt - workloadStartedAt) / 1000, 0.001),
      deliveredEventsPerSec: samples.length / Math.max((workloadEndedAt - workloadStartedAt) / 1000, 0.001),
    },
    reliability: {
      sent: issuedOperations,
      delivered: samples.length,
      lostOrUnmatched: Math.max(issuedOperations - samples.length - [...pending.values()].filter(x => !x.systemType).length, 0),
      pending: [...pending.values()].filter(x => !x.systemType).length,
      errors: errors.length,
    },
    latency: stats(latencies),
    byOp,
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
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
