import { KanbanShell }         from '@realtime-thesis/shared-ui';
import { useSSEKanbanAdapter } from '@realtime-thesis/communication-adapters';

export default function App() {
  const adapter = useSSEKanbanAdapter();
  return <KanbanShell adapter={adapter} />;
}