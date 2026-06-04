import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildRunMetadata,
  buildRunFolderName,
  containerResultDir,
  getStructuredResultDir,
  parseNetemSpec,
  writeCsvArtifacts,
} from './lib/results.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPOSE = ['compose', '-f', 'docker-compose.benchmark.yml'];

const TRANSPORTS = {
  websocket: {
    profile: 'chat-ws',
    service: 'websocket-chat-server',
    container: 'benchmark-websocket-chat-server',
    baseUrl: 'http://websocket-chat-server:4001',
  },
  sse: {
    profile: 'chat-sse',
    service: 'sse-chat-server',
    container: 'benchmark-sse-chat-server',
    baseUrl: 'http://sse-chat-server:4002',
  },
  longpolling: {
    profile: 'chat-lp',
    service: 'longpolling-chat-server',
    container: 'benchmark-longpolling-chat-server',
    baseUrl: 'http://longpolling-chat-server:4003',
  },
};

const args = parseArgs(process.argv.slice(2));
const runId = args.runId || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const transport = TRANSPORTS[args.transport];
const runParams = pickParams(args, ['clients', 'rate', 'warmupMs', 'durationMs']);
const netemSpec = parseNetemSpec(args.netem);
const runFolder = buildRunFolderName({ runId, params: runParams, netem: netemSpec });
const resultDir = getStructuredResultDir(ROOT, 'chat', args.transport, runFolder);
const containerResults = containerResultDir('chat', args.transport, runFolder);

const metricsPath = path.join(resultDir, `chat-${args.transport}-${runId}-docker-stats.ndjson`);
const enrichedPath = path.join(resultDir, `chat-${args.transport}-${runId}-full-summary.json`);

let statSamples = [];
let samplerTimer;

try {
  console.log(`[suite:chat] transport=${args.transport} runId=${runId}`);
  compose(['up', '-d', 'postgres', 'redis']);
  compose(['--profile', transport.profile, 'up', '-d', '--build', transport.service]);
  compose(['--profile', 'runner', 'up', '-d', '--build', 'benchmark-runner']);
  if (args.netem) applyNetem(args.netem);

  startDockerStatsSampler(transport.container, metricsPath);

  await runAsync('docker', [
    ...COMPOSE,
    'exec', '-T', 'benchmark-runner',
    'npm', 'run', 'benchmark:chat', '-w', 'benchmarks', '--',
    '--transport', args.transport,
    '--base-url', transport.baseUrl,
    '--clients', String(args.clients),
    '--rate', String(args.rate),
    '--warmup-ms', String(args.warmupMs),
    '--duration-ms', String(args.durationMs),
    '--result-dir', containerResults,
    '--run-id', runId,
  ], { stdio: 'inherit' });
} finally {
  stopDockerStatsSampler();
  if (args.netem) clearNetem();
}

const summaryPath = path.join(resultDir, `chat-${args.transport}-${runId}-summary.json`);
if (fs.existsSync(summaryPath)) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const metadata = buildRunMetadata({
    app: 'chat',
    transport: args.transport,
    runId,
    runFolder,
    params: runParams,
    netem: netemSpec,
    service: transport.service,
    container: transport.container,
  });
  const enriched = {
    ...summary,
    serverResources: summarizeDockerStats(statSamples),
    network: summarizeNetwork(statSamples, summary.samples || 0),
    testParameters: metadata,
    automation: {
      dockerStatsPath: metricsPath,
      composeService: transport.service,
      composeContainer: transport.container,
      netem: args.netem || null,
    },
  };
  fs.writeFileSync(enrichedPath, JSON.stringify(enriched, null, 2));
  const csv = writeCsvArtifacts({
    app: 'chat',
    transport: args.transport,
    runId,
    outputDir: resultDir,
    summary,
    enriched,
    rawPath: path.join(resultDir, `chat-${args.transport}-${runId}.ndjson`),
    statSamples,
    metadata,
  });
  console.log(`[suite:chat] full summary: ${enrichedPath}`);
  console.log(`[suite:chat] csv: ${csv.summaryCsvPath}`);
}

function parseArgs(argv) {
  const out = {
    transport: 'websocket',
    clients: 50,
    rate: 25,
    warmupMs: 30_000,
    durationMs: 300_000,
    runId: '',
    netem: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === '--transport') out.transport = n, i += 1;
    else if (a === '--clients') out.clients = Number(n), i += 1;
    else if (a === '--rate') out.rate = Number(n), i += 1;
    else if (a === '--warmup-ms') out.warmupMs = Number(n), i += 1;
    else if (a === '--duration-ms') out.durationMs = Number(n), i += 1;
    else if (a === '--run-id') out.runId = n, i += 1;
    else if (a === '--netem') out.netem = n, i += 1;
  }
  if (!TRANSPORTS[out.transport]) throw new Error(`Unknown transport ${out.transport}`);
  return out;
}

function pickParams(source, keys) {
  return Object.fromEntries(keys.map(key => [key, source[key]]));
}

function compose(extra) {
  run('docker', [...COMPOSE, ...extra], { stdio: 'inherit' });
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with ${res.status}`);
  return res.stdout;
}

function runAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, ...opts });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} failed with ${code}`)));
  });
}

function startDockerStatsSampler(container, outputPath) {
  const stream = fs.createWriteStream(outputPath, { flags: 'w' });
  const sample = () => {
    const res = spawnSync('docker', ['stats', '--no-stream', '--format', '{{json .}}', container], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (res.status !== 0 || !res.stdout.trim()) return;
    const normalized = normalizeDockerStats(JSON.parse(res.stdout.trim()));
    statSamples.push(normalized);
    stream.write(`${JSON.stringify(normalized)}\n`);
  };
  sample();
  samplerTimer = setInterval(sample, 1000);
  samplerTimer.unref?.();
  samplerTimer.stream = stream;
}

function stopDockerStatsSampler() {
  if (!samplerTimer) return;
  clearInterval(samplerTimer);
  samplerTimer.stream?.end();
  samplerTimer = undefined;
}

function normalizeDockerStats(row) {
  const [netRxBytes, netTxBytes] = parsePairBytes(row.NetIO);
  const [memUsageBytes, memLimitBytes] = parsePairBytes(row.MemUsage);
  return {
    ts: new Date().toISOString(),
    name: row.Name,
    cpuPercent: Number(String(row.CPUPerc || '0').replace('%', '')),
    memUsageBytes,
    memLimitBytes,
    memPercent: Number(String(row.MemPerc || '0').replace('%', '')),
    netRxBytes,
    netTxBytes,
    raw: row,
  };
}

function summarizeDockerStats(samples) {
  return {
    samples: samples.length,
    cpu: stats(samples.map(s => s.cpuPercent)),
    memoryBytes: stats(samples.map(s => s.memUsageBytes)),
    memoryPercent: stats(samples.map(s => s.memPercent)),
  };
}

function summarizeNetwork(samples, deliveredSamples) {
  if (samples.length < 2) return { rxBytes: 0, txBytes: 0, totalBytes: 0, bytesPerDeliveredEvent: null };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const rxBytes = Math.max(last.netRxBytes - first.netRxBytes, 0);
  const txBytes = Math.max(last.netTxBytes - first.netTxBytes, 0);
  const totalBytes = rxBytes + txBytes;
  return { rxBytes, txBytes, totalBytes, bytesPerDeliveredEvent: deliveredSamples > 0 ? totalBytes / deliveredSamples : null };
}

function stats(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return { count: 0, min: null, avg: null, p95: null, max: null };
  return { count: clean.length, min: clean[0], avg: clean.reduce((a, b) => a + b, 0) / clean.length, p95: percentile(clean, 0.95), max: clean[clean.length - 1] };
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function parsePairBytes(value) {
  const [a, b] = String(value || '0B / 0B').split('/').map(s => parseBytes(s.trim()));
  return [a || 0, b || 0];
}

function parseBytes(value) {
  const match = String(value).match(/^([\d.]+)\s*([KMGT]?i?B|B)$/i);
  if (!match) return 0;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const powers = { b: 1, kb: 1000, mb: 1000 ** 2, gb: 1000 ** 3, tb: 1000 ** 4, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };
  return n * (powers[unit] || 1);
}

function applyNetem(spec) {
  const env = Object.fromEntries(spec.split(',').map(part => part.split('=')));
  run('docker', [
    ...COMPOSE, '--profile', 'runner', '--profile', 'netem', 'run', '--rm',
    '-e', 'TARGET_SERVICE=benchmark-runner',
    ...Object.entries({
      NETEM_DELAY_MS: env.delay || env.delayMs || '',
      NETEM_JITTER_MS: env.jitter || env.jitterMs || '',
      NETEM_LOSS_PERCENT: env.loss || env.lossPercent || '',
      NETEM_RATE: env.rate || '',
    }).filter(([, v]) => v !== '').flatMap(([k, v]) => ['-e', `${k}=${v}`]),
    'netem', 'apply',
  ], { stdio: 'inherit' });
}

function clearNetem() {
  run('docker', [...COMPOSE, '--profile', 'runner', '--profile', 'netem', 'run', '--rm', '-e', 'TARGET_SERVICE=benchmark-runner', 'netem', 'clear'], { stdio: 'inherit' });
}
