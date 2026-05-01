import { DashboardShell }        from '@realtime-thesis/shared-ui';
import { useLongPollingAdapter } from '@realtime-thesis/communication-adapters';

export default function App() {
  const adapter = useLongPollingAdapter('http://localhost:4007');
  return <DashboardShell adapter={adapter} />;
}