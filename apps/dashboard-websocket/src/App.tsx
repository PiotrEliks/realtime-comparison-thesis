import { DashboardShell }       from '@realtime-thesis/shared-ui';
import { useWebSocketAdapter }  from '@realtime-thesis/communication-adapters';

const WS_URL = 'ws://localhost:4005';

export default function App() {
  const adapter = useWebSocketAdapter(WS_URL);
  return <DashboardShell adapter={adapter} />;
}