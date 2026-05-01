import { memo } from 'react';
import { dangerHex } from '../../../utils/colors';

interface Props {
  value:     number;
  max?:      number;
  label:     string;
  unit?:     string;
  warnAt?:   number;
  critAt?:   number;
  inverted?: boolean;
  size?:     'sm' | 'md' | 'lg';
}

export const Gauge = memo(({
  value, max = 100, label, unit = '%',
  warnAt = 75, critAt = 90, inverted = false, size = 'md',
}: Props) => {
  const pct   = Math.min((value / max) * 100, 100);
  const color = dangerHex(value, warnAt, critAt, inverted);
  const C     = 2 * Math.PI * 42;
  const dash  = (pct / 100) * C;
  const sz = { sm: 'w-16 h-16', md: 'w-[88px] h-[88px]', lg: 'w-28 h-28' }[size];
  const fs = { sm: 'text-sm',   md: 'text-base',           lg: 'text-xl'  }[size];

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      <div className={`relative ${sz}`}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="9" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="9"
            strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.3s ease, stroke 0.4s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${fs} font-bold tabular-nums leading-none`} style={{ color }}>
            {Math.round(value)}<span className="text-[0.6em] opacity-70">{unit}</span>
          </span>
        </div>
      </div>
      <span className="text-[10px] text-slate-500 text-center leading-tight max-w-[5rem]">{label}</span>
    </div>
  );
});