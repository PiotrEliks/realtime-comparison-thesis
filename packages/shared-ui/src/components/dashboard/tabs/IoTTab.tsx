import { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from 'recharts';
import type { DashboardSnapshot } from '../../../types/metrics';
import { MetricCard } from '../primitives/MetricCard';
import { IOT_COLORS } from '../../../utils/colors';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Props { history: DashboardSnapshot[]; snap: DashboardSnapshot }

export function IoTTab({ history, snap }: Props) {
  const tempH = useMemo(() => history.map((h, i) => {
    const row: Record<string, number> = { i };
    h.iot.filter(s => s.isOnline).forEach(s => { row[s.name] = s.temperature; });
    return row;
  }), [history]);

  const { iot } = snap;

  return (
    <div className="flex flex-col gap-4">

      {/* Sensor table */}
      <MetricCard title="Sensor Status">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[9px] text-slate-600 uppercase tracking-wider border-b border-white/[0.04]">
              <th className="pb-2 text-left w-4" />
              <th className="pb-2 text-left">Name</th>
              <th className="pb-2 text-left">Location</th>
              <th className="pb-2 text-right">Temp</th>
              <th className="pb-2 text-right">Humidity</th>
              <th className="pb-2 text-right">CO₂</th>
              <th className="pb-2 text-right">Pressure</th>
              <th className="pb-2 text-right w-24">Battery</th>
            </tr>
          </thead>
          <tbody>
            {iot.map((s, idx) => {
              const co2c   = s.co2 > 1500 ? 'text-red-400' : s.co2 > 1000 ? 'text-amber-400' : 'text-emerald-400';
              const batHex = s.batteryLevel > 50 ? '#34d399' : s.batteryLevel > 20 ? '#fbbf24' : '#f87171';
              return (
                <tr key={s.id} className={`border-b border-white/[0.03] last:border-0 transition-opacity ${!s.isOnline ? 'opacity-30' : ''}`}>
                  <td className="py-2 pr-2">
                    <div className={`w-2 h-2 rounded-full ${s.isOnline ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
                  </td>
                  <td className="py-2 font-medium text-slate-200">{s.name}</td>
                  <td className="py-2 text-slate-500">{s.location}</td>
                  <td className="py-2 text-right font-mono text-blue-300">{s.temperature.toFixed(1)}°C</td>
                  <td className="py-2 text-right font-mono text-purple-300">{s.humidity.toFixed(0)}%</td>
                  <td className={`py-2 text-right font-mono font-semibold ${co2c}`}>{s.co2}</td>
                  <td className="py-2 text-right font-mono text-slate-500">{s.pressure.toFixed(0)} hPa</td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${s.batteryLevel}%`, backgroundColor: batHex }} />
                      </div>
                      <span className="font-mono text-slate-400 text-[10px] w-8 text-right">
                        {s.batteryLevel.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </MetricCard>

      <div className="grid grid-cols-3 gap-4">

        {/* Temperature history */}
        <MetricCard title="Temperature History (°C)" accent="cyan">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={tempH} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#475569' }} width={28} />
              <Tooltip
                contentStyle={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 10 }}
                formatter={(v: number) => [`${v.toFixed(1)}°C`]}
                labelFormatter={() => ''}
              />
              {iot.slice(0, 6).map((s, i) => (
                <Line key={s.id} type="monotone" dataKey={s.name}
                  stroke={IOT_COLORS[i]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </MetricCard>

        {/* CO2 bars */}
        <MetricCard title="CO₂ Levels (ppm)" accent="violet">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={iot.map(s => ({ name: s.name.slice(0, 7), co2: s.isOnline ? s.co2 : 0 }))}
              margin={{ top: 4, right: 4, left: 0, bottom: 16 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#475569' }} />
              <YAxis tick={{ fontSize: 9, fill: '#475569' }} width={28} />
              <ReferenceLine y={1000} stroke="#fbbf24" strokeDasharray="4 3" />
              <ReferenceLine y={1500} stroke="#f87171" strokeDasharray="4 3" />
              <Bar dataKey="co2" fill="#8b5cf6" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </MetricCard>

        {/* Noise + humidity dual bars */}
        <MetricCard title="Noise (dB) & Humidity (%)" accent="pink">
          <div className="flex flex-col gap-2.5 py-1">
            {iot.filter(s => s.isOnline).map(s => (
              <div key={s.id}>
                <div className="flex justify-between text-[9px] mb-1">
                  <span className="text-slate-400">{s.name}</span>
                  <div className="flex gap-2 font-mono">
                    <span className="text-orange-300">{s.noise.toFixed(0)}dB</span>
                    <span className="text-blue-300">{s.humidity.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="flex gap-1 h-2">
                  <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full bg-orange-400/70 transition-all duration-300"
                      style={{ width: `${clamp(s.noise / 90 * 100, 0, 100)}%` }} />
                  </div>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full bg-blue-400/70 transition-all duration-300"
                      style={{ width: `${s.humidity}%` }} />
                  </div>
                </div>
              </div>
            ))}
            <div className="flex gap-4 pt-1 text-[9px] text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-1.5 rounded bg-orange-400/70 inline-block" />Noise
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-1.5 rounded bg-blue-400/70 inline-block" />Humidity
              </span>
            </div>
          </div>
        </MetricCard>
      </div>
    </div>
  );
}