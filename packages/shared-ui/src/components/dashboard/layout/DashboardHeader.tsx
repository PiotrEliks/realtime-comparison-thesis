import type { IDashboardAdapter } from '../../../types/adapter';

const STATUS: Record<string, { dot: string; label: string }> = {
  connected:    { dot: 'bg-emerald-400',             label: 'Connected'    },
  connecting:   { dot: 'bg-amber-400 animate-pulse', label: 'Connecting…'  },
  disconnected: { dot: 'bg-slate-600',               label: 'Disconnected' },
  error:        { dot: 'bg-red-500 animate-pulse',   label: 'Error'        },
};

interface Props {
  adapter:       IDashboardAdapter;
  onAlertsClick: () => void;
}

export function DashboardHeader({ adapter, onAlertsClick }: Props) {
  const { status, technology, latency, msgsPerSec, messagesReceived, lostPackets, paused, togglePause, alerts } = adapter;
  const st         = STATUS[status] ?? STATUS.disconnected;
  const critCount  = alerts.filter(a => a.level === 'critical').length;
  const alertCount = alerts.length;

  return (
    <header className="flex-shrink-0 h-12 px-5 flex items-center justify-between border-b border-white/[0.06] bg-[#0a1020]/80 backdrop-blur-sm">

      {/* Left */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] font-black text-white">RT</span>
          </div>
          <span className="font-bold text-sm text-slate-100 tracking-tight">Dashboard</span>
        </div>

        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border"
          style={{ background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.25)', color: '#a5b4fc' }}>
          {technology}
        </span>

        {alertCount > 0 && (
          <button onClick={onAlertsClick}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold cursor-pointer transition-all ${
              critCount > 0
                ? 'bg-red-950/80 border-red-600/70 text-red-300 animate-pulse'
                : 'bg-amber-950/80 border-amber-600/70 text-amber-300'
            }`}>
            {critCount > 0 ? '🚨' : '⚠'} {alertCount} alert{alertCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="font-mono font-bold text-emerald-400">{msgsPerSec}</span>
          <span className="text-slate-600">msg/s</span>
        </div>

        <div className="w-px h-4 bg-white/[0.06]" />

        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="font-mono text-slate-300">{messagesReceived.toLocaleString()}</span>
          <span className="text-slate-600">total</span>
        </div>

        {lostPackets > 0 && (
          <>
            <div className="w-px h-4 bg-white/[0.06]" />
            <span className="text-[11px] font-mono text-red-400">⚠ {lostPackets} lost</span>
          </>
        )}

        {latency !== null && (
          <>
            <div className="w-px h-4 bg-white/[0.06]" />
            <span className={`text-[11px] font-mono font-semibold ${
              latency < 30 ? 'text-emerald-400' : latency < 80 ? 'text-amber-400' : 'text-red-400'
            }`}>⚡ {latency}ms</span>
          </>
        )}

        <div className="w-px h-4 bg-white/[0.06]" />

        <button onClick={togglePause}
          className={`text-[11px] flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all ${
            paused
              ? 'bg-amber-900/40 border-amber-700/60 text-amber-300'
              : 'border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-slate-200'
          }`}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>

        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${st.dot}`} />
          <span className="text-[11px] text-slate-400">{st.label}</span>
        </div>
      </div>
    </header>
  );
}