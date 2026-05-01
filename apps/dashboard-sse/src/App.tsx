import { DashboardShell }  from '@realtime-thesis/shared-ui';
import { useSSEAdapter }   from '@realtime-thesis/communication-adapters';

export default function App() {
  const adapter = useSSEAdapter('http://localhost:4006');
  return <DashboardShell adapter={adapter} />;
}