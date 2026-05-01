import { useMemo } from 'react';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer } from 'recharts';
import type { DashboardSnapshot } from '../../../types/metrics';
import { MetricCard } from '../primitives/MetricCard';
import { Gauge }      from '../primitives/Gauge';
import { Sparkline }  from '../primitives/Sparkline';
import { MeterBar }   from '../primitives/MeterBar';
import { dangerColor, dangerHex } from '../../../utils/colors';
import { fmtMB, fmtKBs } from '../../../utils/formatters';

interface Props { history: DashboardSnapshot[]; snap: DashboardSnapshot }

export function SystemTab({ history, snap }: Props) {
  const cpuH = useMemo(() => history.map((h, i) => ({ i, v: h.system.cpu.total })),       [history]);
  const ramH = useMemo(() => history.map((h, i) => ({ i, v: h.system.ram.percent })),     [history]);
  const netH = useMemo(() => history.map((h, i) => ({ i, v: Math.round(h.system.network.bytesIn / 1024) })), [history]);
  const dskH = useMemo(() => history.slice(-40).map((h, i) => ({
    i, r: h.system.disk.readSpeed, w: h.system.disk.writeSpeed,
  })), [history]);

  const { cpu, ram, disk, network } = snap.system;

  return (
    <div className="grid grid-cols-2 gap-4">

      {/* CPU */}
      <MetricCard title="CPU" accent="indigo">
        <div className="flex items-start gap-4">
          <Gauge value={cpu.total} label="Total" warnAt={75} critAt={90} />
          <Gauge value={cpu.temperature} max={100} label="Temp" unit="°C" warnAt={72} critAt={85} />
          <div className="flex-1 grid grid-cols-4 gap-x-2 gap-y-1.5">
            {cpu.cores.map((c, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="text-slate-600">C{i}</span>
                  <span className="font-mono" style={{ color: dangerHex(c, 75, 90) }}>{Math.round(c)}%</span>
                </div>
                <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="h-1 rounded-full transition-all duration-[250ms]"
                    style={{ width: `${c}%`, backgroundColor: dangerHex(c, 75, 90) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Sparkline data={cpuH} dataKey="v" color="#818cf8" height={52}
          refLines={[{ y: 75, color: '#fbbf24' }, { y: 90, color: '#f87171' }]}
          showTooltip unit="%" />
        <p className="text-[9px] text-slate-700 text-right">{cpuH.length} samples</p>
      </MetricCard>

      {/* RAM */}
      <MetricCard title="Memory" accent="violet">
        <div className="flex items-start gap-4">
          <Gauge value={ram.percent} label="Used" warnAt={80} critAt={95} />
          <div className="flex-1 flex flex-col gap-3">
            <div>
              <div className={`text-2xl font-bold tabular-nums ${dangerColor(ram.percent, 80, 95)}`}>
                {fmtMB(ram.used)}
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5">of {fmtMB(ram.total)}</div>
            </div>
            <MeterBar value={ram.used} max={ram.total} color="#a78bfa" label="RAM"  sub={fmtMB(ram.used)} />
            <MeterBar value={ram.swap} max={4096}       color="#f472b6" label="Swap" sub={fmtMB(ram.swap)} />
          </div>
        </div>
        <Sparkline data={ramH} dataKey="v" color="#a78bfa" height={52}
          refLines={[{ y: 80, color: '#fbbf24' }, { y: 95, color: '#f87171' }]} unit="%" />
      </MetricCard>

      {/* Disk I/O */}
      <MetricCard title="Disk I/O" accent="amber">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Read',  value: `${disk.readSpeed} MB/s`,   color: '#60a5fa' },
            { label: 'Write', value: `${disk.writeSpeed} MB/s`,  color: '#fb923c' },
            { label: 'IOPS',  value: disk.iops.toLocaleString(), color: '#34d399' },
          ].map(m => (
            <div key={m.label} className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-sm font-bold tabular-nums" style={{ color: m.color }}>{m.value}</div>
              <div className="text-[9px] text-slate-600 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={72}>
          <BarChart data={dskH} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barCategoryGap="15%">
            <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
            <Bar dataKey="r" fill="#3b82f6" isAnimationActive={false} radius={[2, 2, 0, 0]} />
            <Bar dataKey="w" fill="#f97316" isAnimationActive={false} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 text-[9px] text-slate-600">
          <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded bg-blue-500 inline-block" />Read</span>
          <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded bg-orange-500 inline-block" />Write</span>
        </div>
      </MetricCard>

      {/* Network */}
      <MetricCard title="Network" accent="cyan">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '↓ Inbound',      value: fmtKBs(network.bytesIn),                              color: '#22d3ee' },
            { label: '↑ Outbound',     value: fmtKBs(network.bytesOut),                             color: '#f472b6' },
            { label: 'Dropped/s',      value: `${network.packetsDropped}`,
              color: network.packetsDropped > 20 ? '#f87171' : '#94a3b8' },
            { label: 'GW Latency',     value: `${network.latency}ms`,
              color: network.latency > 100 ? '#f87171' : network.latency > 50 ? '#fbbf24' : '#34d399' },
          ].map(m => (
            <div key={m.label} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-sm font-bold tabular-nums" style={{ color: m.color }}>{m.value}</div>
              <div className="text-[9px] text-slate-600 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
        <Sparkline data={netH} dataKey="v" color="#22d3ee" height={50} unit=" KB/s" showTooltip />
      </MetricCard>
    </div>
  );
}