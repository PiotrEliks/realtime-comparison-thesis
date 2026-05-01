import { useState } from 'react';
import type { KanbanTask, TaskStatus } from '../../../types/Kanban';
import { TASK_STATUSES } from '../../../types/Kanban';
import { TaskCard } from './TaskCard';

interface Props {
  status:       TaskStatus;
  tasks:        KanbanTask[];
  projectKey:   string;
  onTaskClick:  (taskId: string) => void;
  onDrop:       (taskId: string, newStatus: TaskStatus) => void;
  onDragStart:  (taskId: string) => void;
  onAddTask?:   (status: TaskStatus) => void;
}

export function KanbanColumn({
  status, tasks, projectKey, onTaskClick, onDrop, onDragStart, onAddTask,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const meta = TASK_STATUSES.find(s => s.id === status)!;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) onDrop(taskId, status);
  };

  return (
    <div className="flex flex-col min-w-[220px] max-w-[260px] w-[240px] flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center gap-2 px-2 py-2.5 mb-2">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{meta.label}</span>
        <span className="ml-auto text-[10px] font-mono rounded-full px-1.5 py-0.5"
          style={{ background: meta.bg, color: meta.color }}>
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col gap-2 flex-1 rounded-xl p-2 min-h-[120px] transition-all duration-150 ${
          isDragOver
            ? 'bg-indigo-900/20 border-2 border-dashed border-indigo-500/50'
            : 'border-2 border-transparent'
        }`}
      >
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            projectKey={projectKey}
            onClick={() => onTaskClick(task.id)}
            onDragStart={onDragStart}
          />
        ))}

        {/* Empty state */}
        {tasks.length === 0 && !isDragOver && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[10px] text-slate-700">Drop here</p>
          </div>
        )}
      </div>

      {/* Add task button */}
      {onAddTask && (
        <button onClick={() => onAddTask(status)}
          className="mt-2 mx-2 py-1.5 text-[11px] text-slate-600 hover:text-slate-400 border border-dashed border-white/[0.05] hover:border-white/20 rounded-lg transition-all">
          + Add task
        </button>
      )}
    </div>
  );
}