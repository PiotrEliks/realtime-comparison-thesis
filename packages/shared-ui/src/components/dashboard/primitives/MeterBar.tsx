const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Props {
  value:   number;
  max:     number;
  color:   string;
  label:   string;
  sub:     string;
  height?: number;
}

export function MeterBar({ value, max, color, label, sub, height = 6 }: Props) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-20 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height, background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-16 text-right flex-shrink-0">{sub}</span>
    </div>
  );
}