import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  IKanbanAdapter, KanbanUser, KanbanProject, KanbanTask,
  KanbanComment, KanbanHistoryEntry, KanbanViewMode,
  TaskStatus, CreateTaskData,
} from '@realtime-thesis/shared-ui';

const BASE_URL = 'http://localhost:4011';

function normalizeTask(t: any): KanbanTask {
  return {
    id: t.id, projectId: t.projectId ?? t.project_id,
    taskNumber: t.taskNumber ?? t.task_number,
    title: t.title, description: t.description,
    status: t.status, priority: t.priority, type: t.type,
    assigneeId: t.assigneeId ?? t.assignee_id,
    reporterId: t.reporterId ?? t.reporter_id,
    storyPoints: t.storyPoints ?? t.story_points,
    dueDate: t.dueDate ?? t.due_date,
    tags: t.tags || [],
    position: t.position ?? 0,
    createdAt: t.createdAt ?? t.created_at,
    updatedAt: t.updatedAt ?? t.updated_at,
    assignee: t.assignee ? normalizeUser(t.assignee) : undefined,
    reporter: t.reporter ? normalizeUser(t.reporter) : undefined,
  };
}
function normalizeUser(u: any): KanbanUser {
  return {
    id: u.id, username: u.username, email: u.email,
    displayName: u.displayName ?? u.display_name,
    avatarUrl: u.avatarUrl ?? u.avatar_url,
    color: u.color, role: u.role,
  };
}
function normalizeProject(p: any): KanbanProject {
  return {
    id: p.id, name: p.name, key: p.key,
    description: p.description, createdBy: p.created_by ?? p.createdBy,
    members: (p.members || []).map(normalizeUser),
  };
}
function normalizeComment(c: any): KanbanComment {
  return {
    id: c.id, taskId: c.taskId ?? c.task_id,
    userId: c.userId ?? c.user_id, content: c.content,
    createdAt: c.createdAt ?? c.created_at,
    updatedAt: c.updatedAt ?? c.updated_at,
    user: c.user ? normalizeUser(c.user) : undefined,
  };
}
function normalizeHistory(h: any): KanbanHistoryEntry {
  return {
    id: h.id, taskId: h.taskId ?? h.task_id,
    userId: h.userId ?? h.user_id, action: h.action,
    field: h.field, oldValue: h.oldValue ?? h.old_value,
    newValue: h.newValue ?? h.new_value,
    createdAt: h.createdAt ?? h.created_at,
    user: h.user ? normalizeUser(h.user) : undefined,
  };
}

export function useSSEKanbanAdapter(): IKanbanAdapter {
  const [currentUser,  setCurrentUser]  = useState<KanbanUser | null>(null);
  const [authError,    setAuthError]    = useState<string | null>(null);
  const [authLoading,  setAuthLoading]  = useState(false);
  const [status,       setStatus]       = useState<IKanbanAdapter['status']>('disconnected');
  const [projects,     setProjects]     = useState<KanbanProject[]>([]);
  const [currentProject, setCurrentProject] = useState<KanbanProject | null>(null);
  const [tasks,        setTasks]        = useState<KanbanTask[]>([]);
  const [selectedTask, setSelectedTaskState] = useState<KanbanTask | null>(null);
  const [taskComments, setTaskComments] = useState<KanbanComment[]>([]);
  const [taskHistory,  setTaskHistory]  = useState<KanbanHistoryEntry[]>([]);
  const [viewMode,     setViewMode]     = useState<KanbanViewMode>('board');
  const [filterUser,   setFilterUser]   = useState<string | null>(null);
  const [activeUsers,  setActiveUsers]  = useState<string[]>([]);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [latency,      setLatency]      = useState<number | null>(null);

  const esRef        = useRef<EventSource | null>(null);
  const tokenRef     = useRef<string | null>(null);
  const pingRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const projectIdRef = useRef<string | null>(null);

  const apiFetch = useCallback(async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${tokenRef.current}`,
        ...((options.headers as object) ?? {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? res.statusText);
    }
    return res.json();
  }, []);

  const handleSSEEvent = useCallback((eventName: string, data: any) => {
    setMessagesReceived(p => p + 1);
    switch (eventName) {
      case 'connected':
        setCurrentUser(normalizeUser(data.user));
        setProjects(data.projects.map(normalizeProject));
        setStatus('connected');
        break;
      case 'project_loaded':
        setTasks(data.tasks.map(normalizeTask));
        setActiveUsers(data.activeUsers || []);
        break;
      case 'task_created':
        setTasks(p => [...p, normalizeTask(data.task)]);
        break;
      case 'task_updated':
      case 'task_moved':
        setTasks(p => p.map(t => t.id === data.task.id ? normalizeTask(data.task) : t));
        setSelectedTaskState(s => s?.id === data.task.id ? normalizeTask(data.task) : s);
        break;
      case 'task_deleted':
        setTasks(p => p.filter(t => t.id !== data.taskId));
        setSelectedTaskState(s => s?.id === data.taskId ? null : s);
        break;
      case 'comment_added':
        setTaskComments(p => [...p, normalizeComment(data.comment)]);
        break;
      case 'user_joined':
      case 'user_left':
        setActiveUsers(data.activeUsers || []);
        break;
    }
  }, []);

  const openSSE = useCallback((token: string) => {
    esRef.current?.close();
    setStatus('connecting');
    const es = new EventSource(`${BASE_URL}/events?token=${encodeURIComponent(token)}`);
    esRef.current = es;

    const events = ['connected','project_loaded','task_created','task_updated',
      'task_moved','task_deleted','comment_added','user_joined','user_left'];
    events.forEach(name => {
      es.addEventListener(name, (e: MessageEvent) => {
        try { handleSSEEvent(name, JSON.parse(e.data)); } catch { /* ignore */ }
      });
    });
    es.onerror = () => setStatus('error');

    pingRef.current = setInterval(async () => {
      const t0 = Date.now();
      try { await fetch(`${BASE_URL}/ping`); setLatency(Date.now() - t0); }
      catch { /* offline */ }
    }, 5_000);
  }, [handleSSEEvent]);

  const login = useCallback(async (username: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res  = await fetch(`${BASE_URL}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      tokenRef.current = data.token;
      localStorage.setItem('kanban_sse_token', data.token);
      openSSE(data.token);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }, [openSSE]);

  const logout = useCallback(() => {
    tokenRef.current = null;
    localStorage.removeItem('kanban_sse_token');
    esRef.current?.close();
    if (pingRef.current) clearInterval(pingRef.current);
    setCurrentUser(null); setProjects([]); setCurrentProject(null);
    setTasks([]); setStatus('disconnected');
    projectIdRef.current = null;
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('kanban_sse_token');
    if (saved) { tokenRef.current = saved; openSSE(saved); }
    return () => { esRef.current?.close(); if (pingRef.current) clearInterval(pingRef.current); };
  }, [openSSE]);

  const selectProject = useCallback((projectId: string) => {
    if (!projectId) { setCurrentProject(null); projectIdRef.current = null; setTasks([]); return; }
    const proj = projects.find(p => p.id === projectId) ?? null;
    setCurrentProject(proj);
    projectIdRef.current = projectId;
    setTasks([]);
    apiFetch('/api/me/project', { method: 'PATCH', body: JSON.stringify({ projectId }) }).catch(console.error);
  }, [projects, apiFetch]);

  const createTask = useCallback((data: CreateTaskData) => {
    apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify({ projectId: projectIdRef.current, ...data }) }).catch(console.error);
  }, [apiFetch]);

  const updateTask = useCallback((taskId: string, changes: Partial<KanbanTask>) => {
    apiFetch(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ projectId: projectIdRef.current, ...changes }) }).catch(console.error);
  }, [apiFetch]);

  const moveTask = useCallback((taskId: string, newStatus: TaskStatus, position?: number) => {
    apiFetch(`/api/tasks/${taskId}/move`, { method: 'POST', body: JSON.stringify({ projectId: projectIdRef.current, newStatus, position }) }).catch(console.error);
  }, [apiFetch]);

  const deleteTask = useCallback((taskId: string) => {
    apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE', body: JSON.stringify({ projectId: projectIdRef.current }) }).catch(console.error);
  }, [apiFetch]);

  const selectTask = useCallback((taskId: string | null) => {
    if (!taskId) { setSelectedTaskState(null); return; }
    setSelectedTaskState(tasks.find(t => t.id === taskId) ?? null);
    setTaskComments([]); setTaskHistory([]);
    apiFetch(`/api/tasks/${taskId}/detail`).then(data => {
      setTaskComments(data.comments.map(normalizeComment));
      setTaskHistory(data.history.map(normalizeHistory));
    }).catch(console.error);
  }, [tasks, apiFetch]);

  const addComment = useCallback((taskId: string, content: string) => {
    apiFetch(`/api/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ projectId: projectIdRef.current, content }) }).catch(console.error);
  }, [apiFetch]);

  return {
    technology: 'SSE',
    status, currentUser, authError, authLoading, login, logout,
    projects, currentProject, selectProject,
    tasks, createTask, updateTask, moveTask, deleteTask,
    selectedTask, taskComments, taskHistory, selectTask, addComment,
    viewMode, setViewMode, filterUser, setFilterUser,
    activeUsers, messagesReceived, latency,
  };
}