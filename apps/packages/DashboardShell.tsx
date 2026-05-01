import { useState, useMemo } from 'react';
import type { IDashboardAdapter } from '@rt/types';

import { DashboardHeader }  from './components/layout/DashboardHeader';
import { DashboardSidebar } from './components/layout/DashboardSidebar';
import { SystemTab }  from './components/tabs/SystemTab';
import { StocksTab }  from './components/tabs/StocksTab';
import { IoTTab }     from './components/tabs/IoTTab';
import { AppTab }     from './components/tabs/AppTab';
import { AlertsTab }  from './components/tabs/AlertsTab';
import { StatBadge }  from './components/primitives/StatBadge';
import { dangerColor } from './utils/colors';
import { fmtKBs, fmtNum } from './utils/formatters';

type Tab = 'system' | 'stocks' | 'iot' | 'app' | 'alerts';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'system', label: 'System'     },
  { id: 'stocks', label: 'Stocks'     },
  { id: 'iot',    label: 'IoT'        },
  { id: 'app',    label: 'App Server' },
  { id: 'alerts', label: 'Alerts'     },
];

interface Props { adapter: IDashboardAdapter }

export function DashboardShell({ adapter }: Props) {
  const [tab, setTab] = useState<Tab>('system');

  const {
    snapshot: snap, history, alerts, alertHistory,
    paused,
  } = adapter;

  const critCount = alerts.filter(a => a.level === 'critical').length;
  const warnCount = alerts.filter(a => a.level === 'warning').length;

  const alertsLabel = alerts.length > 0
    ? (critCount > 0 ? `🔴 Alerts (${alerts.length})` : `🟡 Alerts (${alerts.length})`)
    : 'Alerts';

  return (
    <div className="h-screen bg-[#060b14] text-slate-100 font-sans flex flex-col overflow-hidden">
      <DashboardHeader
        adapter={adapter}
        onAlertsClick={() => setTab('alerts')}
        alertsBadge={alerts.length}
      />

      <div className="flex flex-1 min-h-0">
        <DashboardSidebar adapter={adapter} />

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* KPI bar + tabs in one strip */}
          <div className="flex-shrink-0 border-b border-white/[0.06] px-4 bg-[#0a1020]/50">
            {snap && (
              <div className="flex items-center gap-5 py-2.5 border-b border-white/[0.04] flex-wrap">
                <StatBadge label="CPU"
                  value={`${snap.system.cpu.total}%`}
                  color={dangerColor(snap.system.cpu.total, 75, 90)} />
                <StatBadge label="RAM"
                  value={`${snap.system.ram.percent.toFixed(1)}%`}
                  color={dangerColor(snap.system.ram.percent, 80, 95)} />
                <StatBadge label="Net In"
                  value={fmtKBs(snap.system.network.bytesIn)}
                  color="text-cyan-400" />
                <StatBadge label="RPS"
                  value={fmtNum(snap.appServer.requestsPerSec)}
                  color="text-indigo-400" />
                <StatBadge label="p99"
                  value={`${snap.appServer.p99ResponseTime}ms`}
                  color={dangerColor(snap.appServer.p99ResponseTime, 500, 2000)} />
                <StatBadge label="Errors"
                  value={`${snap.appServer.errorRate.toFixed(2)}%`}
                  color={dangerColor(snap.appServer.errorRate, 2, 10)} />
                <StatBadge label="Sensors"
                  value={`${snap.iot.filter(x=>x.isOnline).length}/${snap.iot.length}`}
                  color={snap.iot.some(x=>!x.isOnline) ? 'text-red-400' : 'text-slate-400'} />
                {paused && (
                  <span className="ml-auto text-[10px] bg-amber-900/40 border border-amber-700/60 text-amber-300 rounded-md px-2 py-0.5 animate-pulse">
                    ⏸ PAUSED
                  </span>
                )}
              </div>
            )}

            {/* Tab bar */}
            <div className="flex gap-0.5 pt-2">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-3.5 py-1.5 text-[11px] font-semibold rounded-t-md border-b-2 transition-all ${
                    tab === t.id
                      ? 'text-indigo-300 border-indigo-500'
                      : 'text-slate-500 border-transparent hover:text-slate-300'
                  }`}>
                  {t.id === 'alerts' ? alertsLabel : t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {!snap ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-600">
                <div className="w-12 h-12 rounded-xl bg-indigo-900/30 flex items-center justify-center text-2xl animate-pulse">📡</div>
                <p className="text-sm">Connecting to {adapter.technology} server…</p>
              </div>
            ) : (
              <>
                {tab === 'system' && <SystemTab history={history} snap={snap} />}
                {tab === 'stocks' && <StocksTab history={history} snap={snap} />}
                {tab === 'iot'    && <IoTTab    history={history} snap={snap} />}
                {tab === 'app'    && <AppTab    history={history} snap={snap} />}
                {tab === 'alerts' && <AlertsTab active={alerts} history={alertHistory} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}