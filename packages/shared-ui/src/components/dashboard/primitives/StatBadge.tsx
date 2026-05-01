interface Props {
  label:  string;
  value:  string | number;
  color?: string;
  sub?:   string;
}

export function StatBadge({ label, value, color = 'text-slate-100', sub }: Props) {
  return (
    <div className="flex flex-col min-w-0 gap-0.5">
      <span className={`text-lg font-bold tabular-nums leading-none ${color}`}>{value}</span>
      {sub && <span className="text-[9px] text-slate-600">{sub}</span>}
      <span className="text-[9px] text-slate-500">{label}</span>
    </div>
  );
}