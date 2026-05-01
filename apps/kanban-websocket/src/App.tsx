import { KanbanShell }               from '@realtime-thesis/shared-ui';
import { useWebSocketKanbanAdapter } from '@realtime-thesis/communication-adapters';

export default function App() {
  const adapter = useWebSocketKanbanAdapter();
  return <KanbanShell adapter={adapter} />;
}