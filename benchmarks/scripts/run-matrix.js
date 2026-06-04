import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeCsv } from './lib/results.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPOSE = ['compose', '-f', 'docker-compose.benchmark.yml'];
const DEFAULT_APPS = ['kanban', 'chat', 'dashboard', 'whiteboard'];
const DEFAULT_TRANSPORTS = ['websocket', 'sse', 'longpolling'];
const DEFAULT_CLIENTS = [10, 50, 100, 250, 500];
const DEFAULT_NETWORKS = [
  { name: 'baseline', spec: '' },
  { name: 'delay100', spec: 'delay=100' },
  { name: 'delay100-jitter30', spec: 'delay=100,jitter=30' },
  { name: 'delay100-jitter30-loss2', spec: 'delay=100,jitter=30,loss=2' },
];

const args = parseArgs(process.argv.slice(2));
const matrixRunId = args.matrixRunId || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const matrixDir = path.join(ROOT, 'benchmarks', 'results', 'matrix', matrixRunId);
fs.mkdirSync(matrixDir, { recursive: true });

const plan = buildPlan();
const planPath = path.join(matrixDir, 'matrix-plan.csv');
const resultsPath = path.join(matrixDir, 'matrix-results.csv');
const resultsNdjsonPath = path.join(matrixDir, 'matrix-results.ndjson');
writeCsv(planPath, plan);

console.log(`[matrix] id=${matrixRunId}`);
console.log(`[matrix] scenarios=${plan.length}`);
console.log(`[matrix] plan=${planPath}`);

if (args.dryRun) {
  console.log('[matrix] dry run only; no tests executed.');
  process.exit(0);
}

const results = [];
for (const [index, item] of plan.entries()) {
  const ordinal = index + 1;
  const command = buildCommand(item);
  const startedAt = new Date();
  console.log('');
  console.log(`[matrix] ${ordinal}/${plan.length} ${item.app}/${item.transport} clients=${item.clients} network=${item.network} repeat=${item.repeat}/${args.repeats}`);
  console.log(`[matrix] ${command.cmd} ${command.args.join(' ')}`);

  const result = {
    ...item,
    matrixRunId,
    ordinal,
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    durationSec: null,
    status: 'running',
    exitCode: null,
  };

  try {
    const code = await runAsync(command.cmd, command.args, { stdio: 'inherit' });
    result.exitCode = code;
    result.status = code === 0 ? 'passed' : 'failed';
  } catch (err) {
    result.status = 'failed';
    result.exitCode = err.exitCode ?? 1;
    result.error = String(err.message || err);
  } finally {
    const finishedAt = new Date();
    result.finishedAt = finishedAt.toISOString();
    result.durationSec = (finishedAt.getTime() - startedAt.getTime()) / 1000;
    results.push(result);
    fs.appendFileSync(resultsNdjsonPath, `${JSON.stringify(result)}\n`);
    writeCsv(resultsPath, results);
  }

  if (result.status !== 'passed' && !args.continueOnError) {
    console.error(`[matrix] stopping after failed scenario ${ordinal}/${plan.length}`);
    process.exitCode = 1;
    break;
  }

  if (args.downBetween) {
    compose(['down']);
  }
}

console.log('');
console.log(`[matrix] finished. results=${resultsPath}`);

function parseArgs(argv) {
  const out = {
    app: 'all',
    transports: DEFAULT_TRANSPORTS,
    clients: DEFAULT_CLIENTS,
    networks: DEFAULT_NETWORKS,
    repeats: 5,
    warmupMs: 30_000,
    durationMs: 300_000,
    rate: 25,
    seedTasks: 500,
    seedElements: 500,
    intervalMs: 250,
    pingIntervalMs: 5_000,
    matrixRunId: '',
    dryRun: false,
    continueOnError: false,
    downBetween: false,
    limit: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === '--app') out.app = n, i += 1;
    else if (a === '--apps') out.app = n, i += 1;
    else if (a === '--transports') out.transports = csv(n), i += 1;
    else if (a === '--clients') out.clients = csv(n).map(Number), i += 1;
    else if (a === '--repeats') out.repeats = Number(n), i += 1;
    else if (a === '--warmup-ms') out.warmupMs = Number(n), i += 1;
    else if (a === '--duration-ms') out.durationMs = Number(n), i += 1;
    else if (a === '--rate') out.rate = Number(n), i += 1;
    else if (a === '--seed-tasks') out.seedTasks = Number(n), i += 1;
    else if (a === '--seed-elements') out.seedElements = Number(n), i += 1;
    else if (a === '--interval-ms') out.intervalMs = Number(n), i += 1;
    else if (a === '--ping-interval-ms') out.pingIntervalMs = Number(n), i += 1;
    else if (a === '--networks') out.networks = parseNetworks(n), i += 1;
    else if (a === '--matrix-run-id') out.matrixRunId = n, i += 1;
    else if (a === '--limit') out.limit = Number(n), i += 1;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--continue-on-error') out.continueOnError = true;
    else if (a === '--down-between') out.downBetween = true;
  }

  return out;
}

function buildPlan() {
  const apps = args.app === 'all' ? DEFAULT_APPS : csv(args.app);
  const items = [];
  for (const app of apps) {
    for (const transport of args.transports) {
      for (const clients of args.clients) {
        for (const network of args.networks) {
          for (let repeat = 1; repeat <= args.repeats; repeat += 1) {
            const runId = buildRunId({ app, transport, clients, network: network.name, repeat });
            items.push({
              app,
              transport,
              clients,
              network: network.name,
              netem: network.spec,
              repeat,
              repeats: args.repeats,
              runId,
              warmupMs: args.warmupMs,
              durationMs: args.durationMs,
              rate: app === 'dashboard' ? '' : args.rate,
              seedTasks: app === 'kanban' ? args.seedTasks : '',
              seedElements: app === 'whiteboard' ? args.seedElements : '',
              intervalMs: app === 'dashboard' ? args.intervalMs : '',
              pingIntervalMs: app === 'dashboard' ? args.pingIntervalMs : '',
            });
          }
        }
      }
    }
  }
  return args.limit > 0 ? items.slice(0, args.limit) : items;
}

function buildCommand(item) {
  const cmd = 'npm';
  const commandArgs = ['run', `suite:${item.app}`, '-w', 'benchmarks', '--',
    '--transport', item.transport,
    '--clients', String(item.clients),
    '--warmup-ms', String(item.warmupMs),
    '--duration-ms', String(item.durationMs),
    '--run-id', item.runId,
  ];

  if (item.app === 'kanban') {
    commandArgs.push('--seed-tasks', String(args.seedTasks), '--rate', String(args.rate));
  } else if (item.app === 'chat') {
    commandArgs.push('--rate', String(args.rate));
  } else if (item.app === 'dashboard') {
    commandArgs.push('--interval-ms', String(args.intervalMs), '--ping-interval-ms', String(args.pingIntervalMs));
  } else if (item.app === 'whiteboard') {
    commandArgs.push('--seed-elements', String(args.seedElements), '--rate', String(args.rate));
  } else {
    throw new Error(`Unknown app ${item.app}`);
  }

  if (item.netem) commandArgs.push('--netem', item.netem);
  return { cmd, args: commandArgs };
}

function buildRunId({ app, transport, clients, network, repeat }) {
  return [
    matrixRunId,
    app,
    transport,
    `c${clients}`,
    network,
    `rep${String(repeat).padStart(2, '0')}`,
  ].join('-').replace(/[^a-z0-9._=-]+/gi, '-');
}

function runAsync(cmd, commandArgs, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, commandArgs, {
      cwd: ROOT,
      shell: process.platform === 'win32',
      ...opts,
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve(code);
      else {
        const err = new Error(`${cmd} ${commandArgs.join(' ')} failed with ${code}`);
        err.exitCode = code;
        reject(err);
      }
    });
  });
}

function compose(extra) {
  const res = spawnSync('docker', [...COMPOSE, ...extra], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`docker ${COMPOSE.concat(extra).join(' ')} failed with ${res.status}`);
}

function parseNetworks(value) {
  return csv(value).map(item => {
    if (item === 'baseline') return { name: 'baseline', spec: '' };
    const [name, spec = item] = item.split(':');
    return { name, spec };
  });
}

function csv(value) {
  return String(value || '').split(',').map(x => x.trim()).filter(Boolean);
}
