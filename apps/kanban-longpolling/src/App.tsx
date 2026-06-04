import { KanbanShell } from '@realtime-thesis/shared-ui';
import { useLongPollingKanbanAdapter } from '@realtime-thesis/communication-adapters';

export default function App() {
  const adapter = useLongPollingKanbanAdapter();
  return <KanbanShell adapter={adapter} />;
}
