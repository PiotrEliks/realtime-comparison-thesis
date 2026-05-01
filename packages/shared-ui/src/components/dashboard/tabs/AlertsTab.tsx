import type { Alert } from '../../../types/metrics';
import { fmtTs } from '../../../utils/formatters';

const LEVEL: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  critical: { bg: 'bg-red-950/60',   border: 'border-red-600/60',   text: 'text-red-200',   badge: 'bg-red-500/20 text-red-300'   },
  warning:  { bg: 'bg-amber-950/60', border: 'border-amber-600/60', text: 'text-amber-200', badge: 'bg-amber-500/20 text-amber-300' },
  info:     { bg: 'bg-blue-950/60',  border: 'border-blue-600/60',  text: 'text-blue-200',  badge: 'bg-blue-500/20 text-blue-300'  },
};

function AlertCard({ a }: { a: Alert }) {
  const cls = LEVEL[a.level] ?? LEVEL.info;
  return (
    <div className={`rounded-xl border p-3.5 ${cls.bg} ${cls.border}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${cls.badge}`}>
          {a.level}
        </span>
        <span className={`text-xs font-semibold ${cls.text}`}>{a.metric}</span>
        <span className="ml-auto font-mono text-xs text-slate-500 tabular-nums">
          {a.value} / <span className="text-slate-600">{a.threshold}</span>
        </span>
      </div>
      <p className={`text-xs opacity-80 ${cls.text}`}>{a.message}</p>
    </div>
  );
}

interface Props { active: Alert[]; history: Alert[] }

export function AlertsTab({ active, history }: Props) {
  return (
    <div className="grid grid-cols-2 gap-5">

      <div>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
          Active <span className="text-slate-300">{active.length}</span>
        </h4>
        {active.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] p-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm text-slate-500">All systems nominal</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.map(a => <AlertCard key={a.id} a={a} />)}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
          Recent History
        </h4>
        <div className="flex flex-col divide-y divide-white/[0.04] max-h-[65vh] overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">No alerts triggered yet</p>
          ) : history.map((a, i) => {
            const col = a.level === 'critical' ? 'text-red-400' : a.level === 'warning' ? 'text-amber-400' : 'text-blue-400';
            return (
              <div key={`${a.id}-${i}`} className="flex items-start gap-2 py-1.5 text-[10px]">
                <span className={`flex-shrink-0 font-bold uppercase w-10 ${col}`}>{a.level.slice(0, 4)}</span>
                <span className="text-slate-300 flex-1 leading-relaxed">{a.metric} — {a.message}</span>
                <span className="text-slate-600 flex-shrink-0 tabular-nums">{fmtTs(a.triggeredAt)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}