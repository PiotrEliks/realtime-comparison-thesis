import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  IKanbanAdapter, KanbanUser, KanbanProject, KanbanTask,
  KanbanComment, KanbanHistoryEntry, KanbanViewMode,
  TaskStatus, CreateTaskData,
} from '@realtime-thesis/shared-ui/src/types/Kanban';

const BASE_URL = 'http://localhost:4010';
const WS_URL   = 'ws://localhost:4010';

export function useWebSocketKanbanAdapter(): IKanbanAdapter {
  // ─── Auth ────────────────────────────────────────────────────────────────
  const [currentUser,  setCurrentUser]  = useState<KanbanUser | null>(null);
  const [authError,    setAuthError]    = useState<string | null>(null);
  const [authLoading,  setAuthLoading]  = useState(false);

  // ─── Connection ──────────────────────────────────────────────────────────
  const [status, setStatus] = useState<IKanbanAdapter['status']>('disconnected');

  // ─── Project ─────────────────────────────────────────────────────────────
  const [projects,       setProjects]       = useState<KanbanProject[]>([]);
  const [currentProject, setCurrentProject] = useState<KanbanProject | null>(null);

  // ─── Tasks ───────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<KanbanTask[]>([]);

  // ─── Task detail ─────────────────────────────────────────────────────────
  const [selectedTask,  setSelectedTaskState] = useState<KanbanTask | null>(null);
  const [taskComments,  setTaskComments]  = useState<KanbanComment[]>([]);
  const [taskHistory,   setTaskHistory]   = useState<KanbanHistoryEntry[]>([]);

  // ─── View ─────────────────────────────────────────────────────────────────
  const [viewMode,    setViewMode]    = useState<KanbanViewMode>('board');
  const [filterUser,  setFilterUser]  = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);

  // ─── Stats ────────────────────────────────────────────────────────────────
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);

  // ─── Refs ─────────────────────────────────────────────────────────────────
  const wsRef      = useRef<WebSocket | null>(null);
  const tokenRef   = useRef<string | null>(null);
  const pingRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── WS send ─────────────────────────────────────────────────────────────
  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(msg));
  }, []);

  // ─── WS message handler ──────────────────────────────────────────────────
  const handleMessage = useCallback((msg: any) => {
    setMessagesReceived(p => p + 1);
    switch (msg.type) {

      case 'AUTHENTICATED':
        setCurrentUser(msg.user);
        setProjects(msg.projects.map(normalizeProject));
        break;

      case 'AUTH_ERROR':
        setAuthError(msg.message);
        setAuthLoading(false);
        break;

      case 'PROJECT_LOADED':
        setTasks(msg.tasks.map(normalizeTask));
        setActiveUsers(msg.activeUsers || []);
        break;

      case 'TASK_CREATED':
        setTasks(p => [...p, normalizeTask(msg.task)]);
        break;

      case 'TASK_UPDATED':
      case 'TASK_MOVED':
        setTasks(p => p.map(t => t.id === msg.task.id ? normalizeTask(msg.task) : t));
        // Update selectedTask if open
        setSelectedTaskState(s => s?.id === msg.task.id ? normalizeTask(msg.task) : s);
        break;

      case 'TASK_DELETED':
        setTasks(p => p.filter(t => t.id !== msg.taskId));
        setSelectedTaskState(s => s?.id === msg.taskId ? null : s);
        break;

      case 'COMMENT_ADDED':
        setTaskComments(p => [...p, normalizeComment(msg.comment)]);
        break;

      case 'TASK_DETAIL':
        setTaskComments(msg.comments.map(normalizeComment));
        setTaskHistory(msg.history.map(normalizeHistory));
        break;

      case 'USER_JOINED':
      case 'USER_LEFT':
        setActiveUsers(msg.activeUsers || []);
        break;

      case 'PONG':
        setLatency(Date.now() - msg.timestamp);
        break;

      case 'ERROR':
        console.error('[Kanban WS]', msg.message);
        break;
    }
  }, []);

  // ─── Connect ─────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!tokenRef.current) return;
    wsRef.current?.close();
    setStatus('connecting');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'AUTH', token: tokenRef.current }));
      pingRef.current = setInterval(() => {
        ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
      }, 5000);
    };

    ws.onmessage = ({ data }) => {
      try { handleMessage(JSON.parse(data)); } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (pingRef.current) clearInterval(pingRef.current);
      if (tokenRef.current)
        reconnRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => setStatus('error');
  }, [handleMessage]);

  // ─── Auth: login ──────────────────────────────────────────────────────────
  const login = useCallback(async (username: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      tokenRef.current = data.token;
      localStorage.setItem('kanban_token', data.token);
      connect();
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }, [connect]);

  const logout = useCallback(() => {
    tokenRef.current = null;
    localStorage.removeItem('kanban_token');
    wsRef.current?.close();
    if (reconnRef.current) clearTimeout(reconnRef.current);
    setCurrentUser(null);
    setProjects([]);
    setCurrentProject(null);
    setTasks([]);
    setStatus('disconnected');
  }, []);

  // ─── Restore session ─────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('kanban_token');
    if (saved) { tokenRef.current = saved; connect(); }
    return () => {
      if (reconnRef.current) clearTimeout(reconnRef.current);
      if (pingRef.current)   clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ─── Project ─────────────────────────────────────────────────────────────
  const selectProject = useCallback((projectId: string) => {
    const proj = projects.find(p => p.id === projectId) ?? null;
    setCurrentProject(proj);
    setTasks([]);
    send({ type: 'SELECT_PROJECT', projectId });
  }, [projects, send]);

  // ─── Tasks ───────────────────────────────────────────────────────────────
  const createTask = useCallback((data: CreateTaskData) => {
    send({ type: 'CREATE_TASK', data });
  }, [send]);

  const updateTask = useCallback((taskId: string, changes: Partial<KanbanTask>) => {
    send({ type: 'UPDATE_TASK', taskId, changes });
  }, [send]);

  const moveTask = useCallback((taskId: string, newStatus: TaskStatus, position?: number) => {
    send({ type: 'MOVE_TASK', taskId, newStatus, position });
  }, [send]);

  const deleteTask = useCallback((taskId: string) => {
    send({ type: 'DELETE_TASK', taskId });
  }, [send]);

  // ─── Task detail ─────────────────────────────────────────────────────────
  const selectTask = useCallback((taskId: string | null) => {
    if (!taskId) { setSelectedTaskState(null); return; }
    const task = tasks.find(t => t.id === taskId) ?? null;
    setSelectedTaskState(task);
    setTaskComments([]);
    setTaskHistory([]);
    send({ type: 'LOAD_TASK', taskId });
  }, [tasks, send]);

  const addComment = useCallback((taskId: string, content: string) => {
    send({ type: 'ADD_COMMENT', taskId, content });
  }, [send]);

  return {
    technology: 'WebSocket',
    status,
    currentUser, authError, authLoading, login, logout,
    projects, currentProject, selectProject,
    tasks, createTask, updateTask, moveTask, deleteTask,
    selectedTask, taskComments, taskHistory, selectTask, addComment,
    viewMode, setViewMode,
    filterUser, setFilterUser,
    activeUsers,
    messagesReceived, latency,
  };
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

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
    userId: c.userId ?? c.user_id,
    content: c.content,
    createdAt: c.createdAt ?? c.created_at,
    updatedAt: c.updatedAt ?? c.updated_at,
    user: c.user ? normalizeUser(c.user) : undefined,
  };
}

function normalizeHistory(h: any): KanbanHistoryEntry {
  return {
    id: h.id, taskId: h.taskId ?? h.task_id,
    userId: h.userId ?? h.user_id,
    action: h.action, field: h.field,
    oldValue: h.oldValue ?? h.old_value,
    newValue: h.newValue ?? h.new_value,
    createdAt: h.createdAt ?? h.created_at,
    user: h.user ? normalizeUser(h.user) : undefined,
  };
}