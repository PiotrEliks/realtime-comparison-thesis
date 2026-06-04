import fs from 'node:fs';
import path from 'node:path';

export function getStructuredResultDir(root, app, transport, runFolder = '') {
  const dir = path.join(root, 'benchmarks', 'results', app, transport, runFolder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function containerResultDir(app, transport, runFolder = '') {
  return ['./results', app, transport, runFolder].filter(Boolean).join('/');
}

export function buildRunFolderName({ runId, params, netem }) {
  const interesting = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${shortKey(key)}${value}`);
  const network = netem.enabled
    ? `netem-d${netem.delayMs}-j${netem.jitterMs}-loss${netem.lossPercent}${netem.rate ? `-rate${netem.rate}` : ''}`
    : 'baseline';
  return sanitizeFolderName([runId, ...interesting, network].join('-'));
}

export function parseNetemSpec(spec) {
  if (!spec) {
    return {
      enabled: false,
      delayMs: 0,
      jitterMs: 0,
      lossPercent: 0,
      rate: '',
      raw: '',
    };
  }
  const parts = Object.fromEntries(spec.split(',').map(part => part.split('=')));
  return {
    enabled: true,
    delayMs: numberOrZero(parts.delay || parts.delayMs),
    jitterMs: numberOrZero(parts.jitter || parts.jitterMs),
    lossPercent: numberOrZero(parts.loss || parts.lossPercent),
    rate: parts.rate || '',
    raw: spec,
  };
}

export function buildRunMetadata({ app, transport, runId, runFolder, params, netem, service, container }) {
  return {
    runId,
    runFolder,
    app,
    transport,
    generatedAt: new Date().toISOString(),
    composeService: service,
    composeContainer: container,
    netemEnabled: netem.enabled,
    netemDelayMs: netem.delayMs,
    netemJitterMs: netem.jitterMs,
    netemLossPercent: netem.lossPercent,
    netemRate: netem.rate,
    netemRaw: netem.raw,
    ...prefixKeys(params, 'param'),
  };
}

export function writeCsvArtifacts({ app, transport, runId, outputDir, summary, enriched, rawPath, statSamples, metadata }) {
  const summaryCsvPath = path.join(outputDir, `${app}-${transport}-${runId}-summary.csv`);
  const samplesCsvPath = path.join(outputDir, `${app}-${transport}-${runId}-samples.csv`);
  const dockerStatsCsvPath = path.join(outputDir, `${app}-${transport}-${runId}-docker-stats.csv`);

  writeCsv(summaryCsvPath, [{ ...metadata, ...flatten(enriched) }]);
  writeRawSamplesCsv(samplesCsvPath, rawPath, metadata);
  writeCsv(dockerStatsCsvPath, statSamples.map(sample => ({ ...metadata, ...flatten(sample) })));

  return { summaryCsvPath, samplesCsvPath, dockerStatsCsvPath };
}

export function writeCsv(filePath, rows) {
  const headers = collectHeaders(rows);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(header => csvEscape(row[header])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function writeRawSamplesCsv(filePath, rawPath, metadata) {
  if (!rawPath || !fs.existsSync(rawPath)) {
    writeCsv(filePath, []);
    return;
  }
  const rows = fs.readFileSync(rawPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => ({ ...metadata, ...flatten(JSON.parse(line)) }));
  writeCsv(filePath, rows);
}

function flatten(value, prefix = '', out = {}) {
  if (Array.isArray(value)) {
    out[prefix || 'value'] = JSON.stringify(value);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      flatten(nested, next, out);
    }
    return out;
  }
  out[prefix || 'value'] = value;
  return out;
}

function prefixKeys(obj, prefix) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [`${prefix}.${key}`, value]));
}

function collectHeaders(rows) {
  const set = new Set();
  for (const row of rows) {
    Object.keys(row).forEach(key => set.add(key));
  }
  return [...set];
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function numberOrZero(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function shortKey(key) {
  const aliases = {
    clients: 'c',
    seedTasks: 'seed',
    seedElements: 'seed',
    rate: 'r',
    warmupMs: 'warm',
    durationMs: 'dur',
    intervalMs: 'int',
    pingIntervalMs: 'ping',
  };
  return aliases[key] || key;
}

function sanitizeFolderName(value) {
  return String(value)
    .replace(/[^a-z0-9._=-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
}
