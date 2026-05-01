import { useEffect, useRef } from 'react';

interface Props {
  value:      number;
  formatter?: (v: number) => string;
  className?: string;
}

export function NumberFlash({ value, formatter = String, className = '' }: Props) {
  const ref     = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    if (!ref.current || value === prevRef.current) return;
    const cls = value > prevRef.current ? 'nf-up' : 'nf-down';
    ref.current.classList.remove('nf-up', 'nf-down');
    void ref.current.offsetWidth;
    ref.current.classList.add(cls);
    prevRef.current = value;
  }, [value]);

  return <span ref={ref} className={className}>{formatter(value)}</span>;
}