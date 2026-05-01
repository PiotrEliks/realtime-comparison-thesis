import { useRef } from 'react';
import type { KanbanTask, KanbanUser } from '../../../types/Kanban';
import { TASK_PRIORITIES, TASK_TYPES } from '../../../types/Kanban';

interface Props {
  task:         KanbanTask;
  projectKey:   string;
  onClick:      () => void;
  onDragStart:  (taskId: string) => void;
}

function Avatar({ user, size = 20 }: { user: KanbanUser; size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.45, backgroundColor: user.color, boxShadow: `0 0 0 2px #0d1420` }}
      title={user.displayName}>
      {user.displayName[0].toUpperCase()}
    </div>
  );
}

export function TaskCard({ task, projectKey, onClick, onDragStart }: Props) {
  const priority = TASK_PRIORITIES.find(p => p.id === task.priority);
  const type     = TASK_TYPES.find(t => t.id === task.type);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(task.id); }}
      onClick={onClick}
      className="group rounded-lg border border-white/[0.06] bg-[#0d1420] p-3 cursor-pointer
                 hover:border-indigo-500/30 hover:bg-[#111827] transition-all duration-150
                 active:opacity-80 select-none"
    >
      {/* Type + Priority */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm" title={type?.label}>{type?.icon ?? '📋'}</span>
          <span className="text-[9px] font-mono text-slate-600">{projectKey}-{task.taskNumber}</span>
        </div>
        <span title={priority?.label}>{priority?.icon ?? '🟡'}</span>
      </div>

      {/* Title */}
      <p className="text-xs font-medium text-slate-200 leading-snug mb-2.5 line-clamp-2 group-hover:text-white transition-colors">
        {task.title}
      </p>

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {task.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-800/50">
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && <span className="text-[9px] text-slate-600">+{task.tags.length - 3}</span>}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          {task.storyPoints != null && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
              {task.storyPoints} sp
            </span>
          )}
          {task.dueDate && (
            <span className={`text-[9px] font-mono ${isOverdue ? 'text-red-400' : 'text-slate-600'}`}>
              {isOverdue ? '⚠ ' : ''}{new Date(task.dueDate).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
            </span>
          )}
        </div>
        {task.assignee && <Avatar user={task.assignee} size={22} />}
      </div>
    </div>
  );
}