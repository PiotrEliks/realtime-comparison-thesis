import { useRef, useState } from 'react';
import type { IKanbanAdapter, KanbanUser, TaskStatus, CreateTaskData, TaskPriority, TaskType } from '../../../types/Kanban';
import { TASK_STATUSES } from '../../../types/Kanban';
import { LoginScreen } from '../login/LoginScreen';
import { KanbanColumn } from './KanbanColumn';
import { AssigneeView } from './AssigneeView';
import { TaskModal }   from '../modal/TaskModal';

interface Props { adapter: IKanbanAdapter }

// ─── New Task Form ─────────────────────────────────────────────────────────────
function NewTaskForm({ onSubmit, onCancel, defaultStatus, members }: {
  onSubmit: (d: CreateTaskData) => void; onCancel: () => void;
  defaultStatus: TaskStatus; members: KanbanUser[];
}) {
  const [title,      setTitle]      = useState('');
  const [status,     setStatus]     = useState<TaskStatus>(defaultStatus);
  const [priority,   setPriority]   = useState<TaskPriority>('medium');
  const [type,       setType]       = useState<TaskType>('task');
  const [assigneeId, setAssigneeId] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0d1420] p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-200 mb-5">Create task</h3>
        <div className="space-y-3">
          <input autoFocus placeholder="Task title *" value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && title.trim() && onSubmit({ title, status, priority, type, assigneeId: assigneeId || undefined })}
            className="w-full text-sm text-slate-200 bg-[#060b14] border border-white/[0.08] rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500/60 placeholder-slate-700"
          />
          <div className="grid grid-cols-3 gap-2">
            {([
              ['Status', status, setStatus, TASK_STATUSES.map(s => [s.id, s.label])],
              ['Priority', priority, setPriority, [['critical','🔴 Critical'],['high','🟠 High'],['medium','🟡 Medium'],['low','🟢 Low']]],
              ['Type', type, setType, [['task','📋 Task'],['feature','⚡ Feature'],['bug','🐛 Bug'],['improvement','🔧 Improve'],['docs','📚 Docs']]],
            ] as any[]).map(([label, val, setter, opts]) => (
              <div key={label}>
                <label className="text-[9px] text-slate-600 uppercase tracking-wider mb-1 block">{label}</label>
                <select value={val} onChange={(e: any) => setter(e.target.value)}
                  className="w-full text-xs bg-[#060b14] border border-white/[0.08] rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:border-indigo-500/60 cursor-pointer">
                  {opts.map(([id, lbl]: [string, string]) => <option key={id} value={id}>{lbl}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div>
            <label className="text-[9px] text-slate-600 uppercase tracking-wider mb-1 block">Assignee</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
              className="w-full text-xs bg-[#060b14] border border-white/[0.08] rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:border-indigo-500/60 cursor-pointer">
              <option value="">Unassigned</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 transition-colors">Cancel</button>
          <button onClick={() => title.trim() && onSubmit({ title, status, priority, type, assigneeId: assigneeId || undefined })}
            disabled={!title.trim()}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-md transition-colors font-semibold">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Shell ───────────────────────────────────────────────────────────────
export function KanbanShell({ adapter }: Props) {
  const {
    currentUser, status, logout,
    projects, currentProject, selectProject,
    tasks, createTask, moveTask, selectTask, selectedTask,
    viewMode, setViewMode, filterUser, setFilterUser,
    activeUsers, messagesReceived, latency,
  } = adapter;

  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus | null>(null);
  const dragTaskId = useRef<string | null>(null);

  // Members from project (currently loaded from PROJECT_LOADED)
  // We get them from tasks (since assignee is joined)
  const membersMap = new Map<string, KanbanUser>();
  tasks.forEach(t => {
    if (t.assignee)  membersMap.set(t.assignee.id,  t.assignee);
    if (t.reporter)  membersMap.set(t.reporter.id,  t.reporter);
  });
  const members = [...membersMap.values()];

  // ── Auth / project selection ──────────────────────────────────────────────
  if (!currentUser) return <LoginScreen adapter={adapter} />;

  if (!currentProject) return (
    <div className="h-screen bg-[#060b14] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-lg font-black text-white">K</div>
          <div>
            <div className="text-lg font-bold text-slate-100">Kanban Board</div>
            <div className="text-[10px] text-slate-500">Choose a project</div>
          </div>
        </div>
        <div className="space-y-2">
          {projects.map(p => (
            <button key={p.id} onClick={() => selectProject(p.id)}
              className="w-full text-left rounded-xl border border-white/[0.06] bg-[#0d1420] px-4 py-4 hover:border-indigo-500/40 hover:bg-[#111827] transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-900/50 border border-indigo-800/50 flex items-center justify-center text-xs font-black text-indigo-300">
                  {p.key}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-white">{p.name}</p>
                  {p.description && <p className="text-[11px] text-slate-600 mt-0.5 truncate">{p.description}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
        <button onClick={logout} className="mt-6 text-xs text-slate-700 hover:text-slate-500 w-full text-center transition-colors">
          Sign out as {currentUser.displayName}
        </button>
      </div>
    </div>
  );

  // ── Board ─────────────────────────────────────────────────────────────────
  const filteredTasks = filterUser
    ? tasks.filter(t => t.assigneeId === filterUser)
    : tasks;

  const tasksByStatus = (s: TaskStatus) =>
    filteredTasks.filter(t => t.status === s).sort((a, b) => a.position - b.position);

  return (
    <div className="h-screen bg-[#060b14] flex flex-col overflow-hidden">

      {/* Topbar */}
      <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#0a1020]">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-black text-white">{currentProject.key}</div>
        <div>
          <p className="text-sm font-bold text-slate-100">{currentProject.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">

          {/* Assignee filter */}
          <div className="flex items-center gap-1">
            {members.slice(0, 5).map(m => (
              <button key={m.id} onClick={() => setFilterUser(filterUser === m.id ? null : m.id)}
                title={m.displayName}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold transition-all ${
                  filterUser === m.id ? 'ring-2 ring-offset-1 ring-offset-[#0a1020] ring-indigo-400 scale-110' :
                    activeUsers.includes(m.id) ? 'opacity-100' : 'opacity-40'
                }`}
                style={{ backgroundColor: m.color }}>
                {m.displayName[0].toUpperCase()}
              </button>
            ))}
            {filterUser && (
              <button onClick={() => setFilterUser(null)} className="text-[10px] text-slate-600 hover:text-slate-400 ml-1">✕</button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-white/[0.06] overflow-hidden">
            {(['board', 'assignee'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`text-[11px] font-semibold px-3 py-1.5 transition-all ${
                  viewMode === mode ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300 bg-transparent'
                }`}>
                {mode === 'board' ? '⊟ Board' : '👤 Assignee'}
              </button>
            ))}
          </div>

          {/* New task button */}
          <button onClick={() => setNewTaskStatus('new')}
            className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors">
            + New task
          </button>

          {/* Status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-green-400' : status === 'connecting' ? 'bg-amber-400' : 'bg-red-500'}`} />
            <span className="text-[10px] text-slate-600">{adapter.technology}</span>
            {latency != null && <span className="text-[10px] font-mono text-slate-700">{latency}ms</span>}
          </div>

          {/* Logout */}
          <button onClick={() => { adapter.selectProject?.(''); }} title="Back to projects"
            className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors">⊙ Projects</button>
          <button onClick={logout} className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors">↩</button>
        </div>
      </header>

      {/* Board area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex flex-col">

          {viewMode === 'board' && (
            <div className="flex gap-3 p-4 h-full overflow-y-auto">
              {TASK_STATUSES.map(s => (
                <KanbanColumn
                  key={s.id}
                  status={s.id as TaskStatus}
                  tasks={tasksByStatus(s.id as TaskStatus)}
                  projectKey={currentProject.key}
                  onTaskClick={selectTask}
                  onDragStart={id => { dragTaskId.current = id; }}
                  onDrop={(taskId, newStatus) => moveTask(taskId, newStatus)}
                  onAddTask={status => setNewTaskStatus(status as TaskStatus)}
                />
              ))}
            </div>
          )}

          {viewMode === 'assignee' && (
            <div className="p-4 overflow-y-auto flex-1">
              <AssigneeView
                tasks={filteredTasks}
                members={members}
                projectKey={currentProject.key}
                onTaskClick={selectTask}
                onMove={moveTask}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {selectedTask && <TaskModal adapter={adapter} projectKey={currentProject.key} members={members} />}
      {newTaskStatus && (
        <NewTaskForm
          defaultStatus={newTaskStatus}
          members={members}
          onCancel={() => setNewTaskStatus(null)}
          onSubmit={data => { createTask(data); setNewTaskStatus(null); }}
        />
      )}
    </div>
  );
}