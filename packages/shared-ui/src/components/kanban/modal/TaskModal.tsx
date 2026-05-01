import { useState, useEffect } from 'react';
import type { IKanbanAdapter, KanbanUser, TaskStatus, TaskPriority, TaskType } from '../../../types/Kanban';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_TYPES } from '../../../types/Kanban';

interface Props { adapter: IKanbanAdapter; projectKey: string; members: KanbanUser[] }

export function TaskModal({ adapter, projectKey, members }: Props) {
  const { selectedTask, taskComments, taskHistory, selectTask, updateTask, deleteTask, addComment, currentUser } = adapter;
  const [tab,     setTab]     = useState<'detail' | 'comments' | 'history'>('detail');
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState<{ title?: string; description?: string } | null>(null);

  useEffect(() => { if (selectedTask) setTab('detail'); }, [selectedTask?.id]);

  if (!selectedTask) return null;

  const statusMeta   = TASK_STATUSES.find(s => s.id === selectedTask.status)!;
  const priorityMeta = TASK_PRIORITIES.find(p => p.id === selectedTask.priority)!;
  const typeMeta     = TASK_TYPES.find(t => t.id === selectedTask.type)!;

  const handleClose = () => selectTask(null);

  const handleSubmitComment = () => {
    if (!comment.trim()) return;
    addComment(selectedTask.id, comment.trim());
    setComment('');
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    updateTask(selectedTask.id, editing);
    setEditing(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>

      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-white/[0.08] bg-[#0d1420] shadow-2xl shadow-black/60 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-white/[0.06] flex-shrink-0">
          <span className="text-xl mt-0.5">{typeMeta.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono text-slate-600">{projectKey}-{selectedTask.taskNumber}</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: statusMeta.bg, color: statusMeta.color }}>{statusMeta.label}</span>
            </div>
            {editing ? (
              <input autoFocus value={editing.title ?? selectedTask.title}
                onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                onBlur={handleSaveEdit} onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                className="w-full text-base font-semibold text-slate-100 bg-transparent border-b border-indigo-500 focus:outline-none pb-0.5"
              />
            ) : (
              <h2 onClick={() => setEditing({ title: selectedTask.title })}
                className="text-base font-semibold text-slate-100 hover:text-white cursor-text transition-colors line-clamp-2">
                {selectedTask.title}
              </h2>
            )}
          </div>
          <button onClick={handleClose} className="text-slate-600 hover:text-slate-300 text-lg leading-none mt-0.5 transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-5 border-b border-white/[0.06] flex-shrink-0">
          {([['detail', 'Details'], ['comments', `Comments (${taskComments.length})`], ['history', 'History']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`text-[11px] font-semibold px-3 py-2.5 border-b-2 transition-all ${
                tab === id ? 'text-indigo-300 border-indigo-500' : 'text-slate-600 border-transparent hover:text-slate-400'
              }`}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {tab === 'detail' && (
            <div className="grid grid-cols-2 gap-5">
              {/* Left: description */}
              <div className="col-span-2 lg:col-span-1">
                <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-2">Description</p>
                {editing ? (
                  <textarea rows={4} value={editing.description ?? selectedTask.description ?? ''}
                    onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                    className="w-full text-sm text-slate-300 bg-[#060b14] border border-white/[0.08] rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500/60 resize-none"
                  />
                ) : (
                  <p onClick={() => setEditing({ description: selectedTask.description ?? '' })}
                    className="text-sm text-slate-400 leading-relaxed cursor-text hover:text-slate-300 min-h-[60px] whitespace-pre-wrap">
                    {selectedTask.description || <span className="text-slate-700 italic">Click to add description…</span>}
                  </p>
                )}
                {editing && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleSaveEdit} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-md transition-colors">Save</button>
                    <button onClick={() => setEditing(null)} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 transition-colors">Cancel</button>
                  </div>
                )}
              </div>

              {/* Right: metadata */}
              <div className="space-y-3">
                {[
                  ['Status', (
                    <select value={selectedTask.status}
                      onChange={e => updateTask(selectedTask.id, { status: e.target.value as TaskStatus })}
                      className="text-xs bg-[#060b14] border border-white/[0.08] rounded-md px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500/60 cursor-pointer w-full"
                    >
                      {TASK_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  )],
                  ['Priority', (
                    <select value={selectedTask.priority}
                      onChange={e => updateTask(selectedTask.id, { priority: e.target.value as TaskPriority })}
                      className="text-xs bg-[#060b14] border border-white/[0.08] rounded-md px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500/60 cursor-pointer w-full"
                    >
                      {TASK_PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
                    </select>
                  )],
                  ['Assignee', (
                    <select value={selectedTask.assigneeId ?? ''}
                      onChange={e => updateTask(selectedTask.id, { assigneeId: e.target.value || undefined })}
                      className="text-xs bg-[#060b14] border border-white/[0.08] rounded-md px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500/60 cursor-pointer w-full"
                    >
                      <option value="">Unassigned</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                    </select>
                  )],
                  ['Story Points', (
                    <input type="number" min="0" max="100"
                      defaultValue={selectedTask.storyPoints ?? ''}
                      onBlur={e => updateTask(selectedTask.id, { storyPoints: parseInt(e.target.value) || undefined })}
                      className="text-xs bg-[#060b14] border border-white/[0.08] rounded-md px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500/60 w-full"
                    />
                  )],
                  ['Reporter', <span className="text-xs text-slate-400">{selectedTask.reporter?.displayName ?? '—'}</span>],
                  ['Created',  <span className="text-xs text-slate-600">{new Date(selectedTask.createdAt).toLocaleString('pl-PL')}</span>],
                ].map(([label, content]) => (
                  <div key={String(label)}>
                    <p className="text-[9px] text-slate-600 uppercase tracking-wider font-bold mb-1">{label as string}</p>
                    {content as React.ReactNode}
                  </div>
                ))}

                <button onClick={() => { if (confirm(`Delete task ${projectKey}-${selectedTask.taskNumber}?`)) { deleteTask(selectedTask.id); handleClose(); } }}
                  className="mt-4 text-xs text-red-500 hover:text-red-400 border border-red-900/50 hover:border-red-700/60 px-3 py-1.5 rounded-md transition-colors w-full">
                  🗑 Delete task
                </button>
              </div>
            </div>
          )}

          {tab === 'comments' && (
            <div className="flex flex-col gap-4">
              {/* Add comment */}
              <div>
                <textarea rows={3} value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Add a comment…"
                  className="w-full text-sm text-slate-300 bg-[#060b14] border border-white/[0.08] rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500/60 resize-none placeholder-slate-700"
                />
                <button onClick={handleSubmitComment} disabled={!comment.trim()}
                  className="mt-2 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-md transition-colors">
                  Post comment
                </button>
              </div>

              {/* Comments list */}
              {taskComments.length === 0 ? (
                <p className="text-sm text-slate-700 text-center py-8">No comments yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {[...taskComments].reverse().map(c => (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: c.user?.color ?? '#475569' }}>
                        {c.user?.displayName?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-300">{c.user?.displayName}</span>
                          <span className="text-[10px] text-slate-600">{new Date(c.createdAt).toLocaleString('pl-PL')}</span>
                        </div>
                        <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="flex flex-col gap-2">
              {taskHistory.length === 0 ? (
                <p className="text-sm text-slate-700 text-center py-8">No history yet</p>
              ) : taskHistory.map(h => (
                <div key={h.id} className="flex items-start gap-3 text-xs py-2 border-b border-white/[0.04] last:border-0">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: h.user?.color ?? '#475569' }}>
                    {h.user?.displayName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1">
                    <span className="text-slate-400">{h.user?.displayName ?? 'System'}</span>
                    {' '}
                    <span className="text-slate-600">
                      {h.action === 'created' && 'created this task'}
                      {h.action === 'status_changed' && <>moved to <span className="text-slate-400">{h.newValue}</span></>}
                      {h.action === 'updated' && <>updated <span className="text-slate-400">{h.field}</span></>}
                      {h.action === 'assigned' && <>assigned to <span className="text-slate-400">{h.newValue}</span></>}
                    </span>
                  </div>
                  <span className="text-slate-700 text-[10px] flex-shrink-0">{new Date(h.createdAt).toLocaleString('pl-PL')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}