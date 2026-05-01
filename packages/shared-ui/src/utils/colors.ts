/** Tailwind text-color class: wyższy = gorszy (CPU, RAM, error rate…) */
export function dangerColor(
  value: number, warnAt: number, critAt: number,
  opts: { inverted?: boolean } = {}
): string {
  const { inverted = false } = opts;
  const bad  = inverted ? value <= critAt : value >= critAt;
  const warn = inverted ? value <= warnAt : value >= warnAt;
  if (bad)  return 'text-red-400';
  if (warn) return 'text-amber-400';
  return 'text-emerald-400';
}

/** Kolor SVG stroke – do gaugeów */
export function dangerHex(
  value: number, warnAt: number, critAt: number, inverted = false
): string {
  const bad  = inverted ? value <= critAt : value >= critAt;
  const warn = inverted ? value <= warnAt : value >= warnAt;
  if (bad)  return '#f87171';
  if (warn) return '#fbbf24';
  return '#34d399';
}

export const STOCK_COLORS: Record<string, string> = {
  AAPL: '#818cf8',
  TSLA: '#34d399',
  NVDA: '#fbbf24',
  MSFT: '#22d3ee',
  AMZN: '#f472b6',
};

export const IOT_COLORS = ['#818cf8','#34d399','#fbbf24','#f472b6','#22d3ee','#a78bfa'];