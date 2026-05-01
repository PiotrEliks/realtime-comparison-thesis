import type { ReactNode } from 'react';

type Accent = 'indigo' | 'emerald' | 'amber' | 'cyan' | 'pink' | 'violet';

const ACCENT: Record<Accent, string> = {
  indigo:  'border-t-indigo-500/60',
  emerald: 'border-t-emerald-500/60',
  amber:   'border-t-amber-500/60',
  cyan:    'border-t-cyan-500/60',
  pink:    'border-t-pink-500/60',
  violet:  'border-t-violet-500/60',
};

interface Props {
  title:      string;
  children:   ReactNode;
  className?: string;
  accent?:    Accent;
}

export function MetricCard({ title, children, className = '', accent }: Props) {
  return (
    <div className={`
      bg-[#0d1420] border border-white/[0.06] rounded-xl p-4
      flex flex-col gap-3 shadow-lg shadow-black/30
      ${accent ? `border-t-2 ${ACCENT[accent]}` : ''}
      ${className}
    `}>
      <h3 className="text-[10px] font-bold tracking-[0.14em] text-slate-500 uppercase">{title}</h3>
      {children}
    </div>
  );
}