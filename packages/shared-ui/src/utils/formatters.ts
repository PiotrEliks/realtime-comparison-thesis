export const fmtMB  = (mb: number): string =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;

export const fmtKBs = (kb: number): string =>
  kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB/s` : `${Math.round(kb)} KB/s`;

export const fmtNum = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}k`
  : `${Math.round(n)}`;

export const fmtTs = (ts: number): string =>
  new Date(ts).toLocaleTimeString('pl-PL', { hour12: false });

export const fmtPct = (v: number, d = 1): string => `${v.toFixed(d)}%`;