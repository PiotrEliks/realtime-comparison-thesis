import type { IDashboardAdapter } from '../../../types/adapter';
import type { SimulationEvent }   from '../../../types/metrics';
import { Sparkline } from '../primitives/Sparkline';

const EVENTS: Array<{ id: SimulationEvent; icon: string; label: string; desc: string }> = [
  { id: 'CPU_SPIKE',          icon: '🔥', label: 'CPU Spike',      desc: 'CPU → ~95% przez 5s'      },
  { id: 'MEMORY_LEAK',        icon: '💧', label: 'Memory Leak',    desc: 'RAM rośnie przez 10s'      },
  { id: 'NETWORK_OUTAGE',     icon: '🌐', label: 'Net Outage',     desc: 'Sieć prawie 0 przez 3s'   },
  { id: 'STOCK_CRASH',        icon: '📉', label: 'Stock Crash',    desc: 'Crash losowego tickera'    },
  { id: 'IOT_SENSOR_OFFLINE', icon: '📡', label: 'Sensor Offline', desc: 'Sensor offline 5s'         },
  { id: 'DDOS_SIMULATION',    icon: '🚨', label: 'DDoS Sim',       desc: 'Spike RPS + błędy'        },
];

const INTERVALS = [100, 250, 500, 1000] as const;

interface Props { adapter: IDashboardAdapter }

export function DashboardSidebar({ adapter }: Props) {
  const { injectEvent, setIntervalMs, currentIntervalMs, latencyHistory } = adapter;
  const latH = latencyHistory.map((v, i) => ({ i, v }));

  return (
    <aside className="w-52 flex-shrink-0 border-r border-white/[0.06] bg-[#0a1020] flex flex-col overflow-y-auto">

      {/* Interval */}
      <div className="p-3 border-b border-white/[0.05]">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Update interval</p>
        <div className="grid grid-cols-2 gap-1">
          {INTERVALS.map(ms => (
            <button key={ms} onClick={() => setIntervalMs(ms)}
              className={`text-xs font-mono rounded-md px-2 py-1.5 border transition-all ${
                currentIntervalMs === ms
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-900/50'
                  : 'border-white/[0.07] text-slate-500 hover:border-white/20 hover:text-slate-300'
              }`}>
              {ms}ms
            </button>
          ))}
        </div>
      </div>

      {/* Events */}
      <div className="p-3 border-b border-white/[0.05] flex flex-col gap-1">
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1">Inject event</p>
        {EVENTS.map(ev => (
          <button key={ev.id} onClick={() => injectEvent(ev.id)}
            className="group flex items-center gap-2 text-left rounded-lg px-2.5 py-2 border border-transparent hover:border-indigo-500/30 transition-all"
            style={{ background: 'rgba(255,255,255,0.025)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.025)'; }}>
            <span className="text-sm">{ev.icon}</span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-300 leading-none">{ev.label}</div>
              <div className="text-[9px] text-slate-600 mt-0.5 truncate">{ev.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* RTT sparkline */}
      {latH.length > 3 && (
        <div className="p-3">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">RTT history (ms)</p>
          <Sparkline data={latH} dataKey="v" color="#a78bfa" height={44} showTooltip unit="ms" />
          <p className="text-[9px] text-slate-700 mt-1 text-right">last {latH.length} pings</p>
        </div>
      )}
    </aside>
  );
}