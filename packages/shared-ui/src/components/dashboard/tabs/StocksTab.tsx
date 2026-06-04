import { useMemo, useEffect, useRef, memo } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { DashboardSnapshot, StockTicker } from '../../../types/metrics';
import { MetricCard } from '../primitives/MetricCard';
import { STOCK_COLORS } from '../../../utils/colors';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const StockRow = memo(({ s }: { s: StockTicker }) => {
  const prevRef = useRef(s.price);
  const elRef   = useRef<HTMLDivElement>(null);
  const dayUp   = s.dayChange >= 0;

  useEffect(() => {
    if (s.price === prevRef.current) return;
    const el = elRef.current;
    if (!el) { prevRef.current = s.price; return; }
    el.classList.remove('price-up', 'price-down');
    void el.offsetWidth;
    el.classList.add(s.price > prevRef.current ? 'price-up' : 'price-down');
    prevRef.current = s.price;
  }, [s.price]);

  const color = STOCK_COLORS[s.symbol] ?? '#94a3b8';
  return (
    <div ref={elRef} className="flex items-center py-2 border-b border-white/[0.04] last:border-0 gap-3 rounded-md px-2 -mx-2">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="font-mono font-bold text-slate-200 w-14 flex-shrink-0">{s.symbol}</span>
      <span className="font-mono text-slate-100 flex-1 tabular-nums">${s.price.toFixed(2)}</span>
      <div className="text-right flex-shrink-0 space-y-0.5">
        <div className={`text-xs font-mono font-semibold ${dayUp ? 'text-emerald-400' : 'text-red-400'}`}>
          {dayUp ? '▲' : '▼'} {Math.abs(s.dayChangePct).toFixed(2)}%
        </div>
        <div className="text-[9px] text-slate-600 tabular-nums">
          {dayUp ? '+' : ''}{s.dayChange.toFixed(2)} today
        </div>
      </div>
    </div>
  );
});

interface Props { history: DashboardSnapshot[]; snap: DashboardSnapshot }

export function StocksTab({ history, snap }: Props) {
  const normData = useMemo(() => history.map((h, i) => {
    const row: Record<string, number> = { i };
    h.stocks.forEach(st => {
      row[st.symbol] = +((( st.price - st.openPrice) / st.openPrice) * 100).toFixed(3);
    });
    return row;
  }), [history]);

  return (
    <div className="grid grid-cols-5 gap-4">

      {/* Left: tickers + spread — 2 cols */}
      <div className="col-span-2 flex flex-col gap-3">
        <MetricCard title="Live Tickers" accent="indigo">
          <p className="text-[9px] text-slate-600 -mt-2 mb-0.5">% change vs session open</p>
          {snap.stocks.map(st => <StockRow key={st.symbol} s={st} />)}
        </MetricCard>

        <MetricCard title="Bid / Ask Spread">
          <div className="grid grid-cols-3 text-[9px] text-slate-600 font-bold uppercase tracking-wider pb-1.5 border-b border-white/[0.04]">
            <span>Ticker</span><span className="text-right">Bid</span><span className="text-right">Ask</span>
          </div>
          {snap.stocks.map(st => (
            <div key={st.symbol} className="grid grid-cols-3 py-1 text-xs">
              <span className="font-mono font-bold" style={{ color: STOCK_COLORS[st.symbol] }}>{st.symbol}</span>
              <span className="text-right font-mono text-emerald-400">{st.bid.toFixed(2)}</span>
              <span className="text-right font-mono text-red-400">{st.ask.toFixed(2)}</span>
            </div>
          ))}
        </MetricCard>
      </div>

      {/* Right: charts — 3 cols */}
      <div className="col-span-3 flex flex-col gap-3">
        <MetricCard title="% Change from Open — normalized" accent="emerald">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={normData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="i" hide />
              <YAxis width={44} tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 10, fill: '#475569' }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
              <Tooltip
                contentStyle={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(3)}%`]}
                labelFormatter={() => ''}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                formatter={v => <span style={{ color: STOCK_COLORS[v] ?? '#94a3b8' }}>{v}</span>}
              />
              {snap.stocks.map(st => (
                <Line key={st.symbol} type="monotone" dataKey={st.symbol}
                  stroke={STOCK_COLORS[st.symbol] ?? '#94a3b8'}
                  dot={false} strokeWidth={1.5} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </MetricCard>

        <MetricCard title="24h High / Low Range">
          <div className="flex flex-col gap-3 py-1">
            {snap.stocks.map(st => {
              const range = st.high24h - st.low24h;
              const pos   = range > 0 ? clamp(((st.price - st.low24h) / range) * 100, 1, 99) : 50;
              const color = STOCK_COLORS[st.symbol] ?? '#818cf8';
              return (
                <div key={st.symbol} className="flex items-center gap-3">
                  <span className="font-mono font-bold w-12 text-sm" style={{ color }}>{st.symbol}</span>
                  <span className="text-[9px] text-slate-600 font-mono w-16 text-right">${st.low24h.toFixed(0)}</span>
                  <div className="flex-1 relative h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="absolute inset-0 rounded-full opacity-20"
                      style={{ background: `linear-gradient(to right, #ef4444, #fbbf24, ${color})` }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-lg transition-all duration-300"
                      style={{ left: `calc(${pos}% - 6px)`, backgroundColor: color, boxShadow: `0 0 8px ${color}80` }} />
                  </div>
                  <span className="text-[9px] text-slate-600 font-mono w-16">${st.high24h.toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        </MetricCard>
      </div>
    </div>
  );
}
