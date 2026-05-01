// ─── Types ────────────────────────────────────────────────────────────────────
export * from './types/metrics';
export * from './types/adapter';

// ─── Dashboard Shell ──────────────────────────────────────────────────────────
export { DashboardShell } from './components/dashboard/DashboardShell';

// ─── Layout ───────────────────────────────────────────────────────────────────
export { DashboardHeader }  from './components/dashboard/layout/DashboardHeader';
export { DashboardSidebar } from './components/dashboard/layout/DashboardSidebar';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export { SystemTab }  from './components/dashboard/tabs/SystemTab';
export { StocksTab }  from './components/dashboard/tabs/StocksTab';
export { IoTTab }     from './components/dashboard/tabs/IoTTab';
export { AppTab }     from './components/dashboard/tabs/AppTab';
export { AlertsTab }  from './components/dashboard/tabs/AlertsTab';

// ─── Primitives ───────────────────────────────────────────────────────────────
export { Gauge }       from './components/dashboard/primitives/Gauge';
export { MetricCard }  from './components/dashboard/primitives/MetricCard';
export { Sparkline }   from './components/dashboard/primitives/Sparkline';
export { MeterBar }    from './components/dashboard/primitives/MeterBar';
export { StatBadge }   from './components/dashboard/primitives/StatBadge';
export { NumberFlash } from './components/dashboard/primitives/NumberFlash';

// ─── Utils ────────────────────────────────────────────────────────────────────
export * from './utils/formatters';
export * from './utils/colors';

export * from './components/kanban';