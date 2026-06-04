import { memo } from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine, Tooltip, YAxis } from 'recharts';

interface RefLine { y: number; color: string }

interface Props {
  data:         object[];
  dataKey:      string;
  color?:       string;
  height?:      number;
  refLines?:    RefLine[];
  showTooltip?: boolean;
  unit?:        string;
}

export const Sparkline = memo(({
  data, dataKey, color = '#818cf8', height = 56,
  refLines = [], showTooltip = false, unit = '',
}: Props) => {
  const id = `sg-${dataKey}-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={['auto', 'auto']} />
        {refLines.map(r => (
          <ReferenceLine key={r.y} y={r.y} stroke={r.color} strokeDasharray="4 3" strokeWidth={1} />
        ))}
        {showTooltip && (
          <Tooltip
            contentStyle={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: number | undefined) => [`${v ?? 0}${unit}`]}
            labelFormatter={() => ''}
          />
        )}
        <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${id})`}
          strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
});
