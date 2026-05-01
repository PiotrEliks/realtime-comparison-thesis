import { useMemo } from 'react';
import {
  AreaChart, Area, CartesianGrid, YAxis,
  ResponsiveContainer, ReferenceLine, Tooltip,
} from 'recharts';
import type { DashboardSnapshot } from '../../../types/metrics';
import { MetricCard } from '../primitives/MetricCard';
import { Gauge }      from '../primitives/Gauge';
import { Sparkline }  from '../primitives/Sparkline';
import { MeterBar }   from '../primitives/MeterBar';
import { dangerColor } from '../../../utils/colors';
import { fmtNum }      from '../../../utils/formatters';

interface Props { history: DashboardSnapshot[]; snap: DashboardSnapshot }

export function AppTab({ history, snap }: Props) {
  const rpsH = useMemo(() => history.map((h, i) => ({ i, v: h.appServer.requestsPerSec })),  [history]);
  const errH = useMemo(() => history.map((h, i) => ({ i, v: h.appServer.errorRate })),        [history]);
  const qH   = useMemo(() => history.slice(-60).map((h, i) => ({ i, v: h.appServer.queueLength })), [history]);

  const { appServer: a } = snap;

  return (
    <div className="grid grid-cols-2 gap-4">

      {/* Throughput */}
      <MetricCard title="Throughput" accent="indigo">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3 text-center"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div className="text-3xl font-bold text-indigo-400 tabular-nums">{fmtNum(a.requestsPerSec)}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">req / sec</div>
          </div>
          <div className="rounded-xl p-3 text-center"
            style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
            <div className="text-3xl font-bold text-violet-400 tabular-nums">{fmtNum(a.activeConnections)}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">connections</div>
          </div>
        </div>
        <Sparkline data={rpsH} dataKey="v" color="#818cf8" height={72} showTooltip unit=" rps" />
      </MetricCard>

      {/* Latency */}
      <MetricCard title="Response Latency" accent="emerald">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'avg', v: a.avgResponseTime,  w: 200,  c: 500  },
            { label: 'p95', v: a.p95ResponseTime,  w: 500,  c: 1500 },
            { label: 'p99', v: a.p99ResponseTime,  w: 1000, c: 3000 },
          ].map(m => (
            <div key={m.label} className="rounded-lg py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className={`text-xl font-bold tabular-nums ${dangerColor(m.v, m.w, m.c)}`}>{m.v}</div>
              <div className="text-[9px] text-slate-600 mt-0.5">{m.label} ms</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className={`text-xl font-bold tabular-nums ${dangerColor(a.errorRate, 2, 10)}`}>
              {a.errorRate.toFixed(2)}%
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">Error Rate</div>
          </div>
          <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className={`text-xl font-bold tabular-nums ${dangerColor(a.cacheHitRate, 60, 40, { inverted: true })}`}>
              {a.cacheHitRate.toFixed(1)}%
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">Cache Hit</div>
          </div>
        </div>
        <Sparkline data={errH} dataKey="v" color="#f87171" height={40}
          refLines={[{ y: 2, color: '#fbbf24' }, { y: 10, color: '#f87171' }]} unit="%" />
      </MetricCard>

      {/* Endpoint breakdown */}
      <MetricCard title="Endpoint Breakdown" accent="amber">
        <div className="space-y-0.5">
          <div className="grid text-[9px] text-slate-600 font-bold uppercase tracking-wider pb-2 border-b border-white/[0.04]"
            style={{ gridTemplateColumns: '1fr 56px 52px 44px' }}>
            <span>Path</span>
            <span className="text-right">Hits/s</span>
            <span className="text-right">Avg ms</span>
            <span className="text-right">Err</span>
          </div>
          {a.endpoints.map(ep => (
            <div key={ep.path} className="grid items-center py-1.5 text-xs border-b border-white/[0.03] last:border-0"
              style={{ gridTemplateColumns: '1fr 56px 52px 44px' }}>
              <span className="font-mono text-slate-300">{ep.path}</span>
              <span className="text-right font-mono text-slate-400 tabular-nums">{ep.hits.toLocaleString()}</span>
              <span className={`text-right font-mono tabular-nums ${dangerColor(ep.avgMs, 150, 300)}`}>{ep.avgMs}</span>
              <span className={`text-right font-mono ${ep.errorCount > 0 ? 'text-red-400' : 'text-slate-700'}`}>
                {ep.errorCount > 0 ? ep.errorCount : '—'}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1 pt-2 border-t border-white/[0.04]">
          {a.endpoints.map(ep => (
            <MeterBar key={ep.path} value={ep.hits} max={a.requestsPerSec}
              color="#818cf8" label={ep.path.replace('/api/', '')} sub={`${ep.hits}/s`} />
          ))}
        </div>
      </MetricCard>

      {/* Queue & cache */}
      <MetricCard title="Queue & Cache" accent="pink">
        <div className="flex items-center gap-5">
          <Gauge value={a.queueLength}  max={500} label="Queue" unit="" warnAt={50}  critAt={200} />
          <Gauge value={a.cacheHitRate}           label="Cache %"      warnAt={60}  critAt={40} inverted />
          <div className="flex-1">
            <p className="text-[9px] text-slate-600 mb-1">Queue depth trend</p>
            <ResponsiveContainer width="100%" height={66}>
              <AreaChart data={qH} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gq-app" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#fbbf24" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} width={24} />
                <ReferenceLine y={50}  stroke="#fbbf24" strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={200} stroke="#f87171" strokeDasharray="3 3" strokeWidth={1} />
                <Tooltip
                  contentStyle={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 10 }}
                  formatter={(v: number) => [v, 'queue']}
                  labelFormatter={() => ''}
                />
                <Area type="monotone" dataKey="v" stroke="#fbbf24" fill="url(#gq-app)"
                  strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </MetricCard>
    </div>
  );
}