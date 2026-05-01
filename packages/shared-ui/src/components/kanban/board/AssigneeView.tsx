import type { KanbanTask, KanbanUser, TaskStatus } from '../../../types/Kanban';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_TYPES } from '../../../types/Kanban';

interface Props {
  tasks:      KanbanTask[];
  members:    KanbanUser[];
  projectKey: string;
  onTaskClick:(taskId: string) => void;
  onMove:     (taskId: string, status: TaskStatus) => void;
}

export function AssigneeView({ tasks, members, projectKey, onTaskClick, onMove }: Props) {
  const unassigned = tasks.filter(t => !t.assigneeId);
  const rows: { user: KanbanUser | null; tasks: KanbanTask[] }[] = [
    ...members.map(m => ({ user: m, tasks: tasks.filter(t => t.assigneeId === m.id) })),
    ...(unassigned.length > 0 ? [{ user: null, tasks: unassigned }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      {rows.map(({ user, tasks: rowTasks }) => (
        <div key={user?.id ?? 'unassigned'}>
          {/* Row header */}
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
              style={{ backgroundColor: user?.color ?? '#475569' }}>
              {user ? user.displayName[0].toUpperCase() : '?'}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">{user?.displayName ?? 'Unassigned'}</p>
              <p className="text-[10px] text-slate-600">{rowTasks.length} task{rowTasks.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Tasks row */}
          {rowTasks.length > 0 ? (
            <div className="flex flex-col gap-1">
              {rowTasks.map(task => {
                const priority = TASK_PRIORITIES.find(p => p.id === task.priority);
                const type     = TASK_TYPES.find(t => t.id === task.type);
                const statusMeta = TASK_STATUSES.find(s => s.id === task.status)!;
                return (
                  <div key={task.id}
                    onClick={() => onTaskClick(task.id)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/[0.05] bg-[#0d1420] hover:border-indigo-500/30 hover:bg-[#111827] cursor-pointer transition-all text-xs group">
                    <span title={type?.label}>{type?.icon}</span>
                    <span className="text-slate-600 font-mono w-12 flex-shrink-0">{projectKey}-{task.taskNumber}</span>
                    <span className="flex-1 text-slate-300 truncate group-hover:text-white">{task.title}</span>
                    <span title={priority?.label}>{priority?.icon}</span>
                    {/* Status chip */}
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: statusMeta.bg, color: statusMeta.color }}>
                      {statusMeta.label}
                    </span>
                    {/* Quick move */}
                    <select
                      value={task.status}
                      onClick={e => e.stopPropagation()}
                      onChange={e => onMove(task.id, e.target.value as TaskStatus)}
                      className="text-[9px] bg-[#060b14] border border-white/[0.08] rounded px-1 py-0.5 text-slate-400 cursor-pointer focus:outline-none"
                    >
                      {TASK_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-slate-700 pl-10 py-2">No tasks assigned</p>
          )}
        </div>
      ))}
    </div>
  );
}