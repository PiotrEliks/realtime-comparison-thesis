import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  IKanbanAdapter, KanbanUser, KanbanProject, KanbanTask,
  KanbanComment, KanbanHistoryEntry, KanbanViewMode,
  TaskStatus, CreateTaskData,
} from '@realtime-thesis/shared-ui';

const BASE_URL = 'http://localhost:4012';
const POLL_TIMEOUT_MS = 25_000;

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

export function useLongPollingKanbanAdapter(): IKanbanAdapter {
  const [currentUser, setCurrentUser] = useState<KanbanUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [status, setStatus] = useState<IKanbanAdapter['status']>('disconnected');
  const [projects, setProjects] = useState<KanbanProject[]>([]);
  const [currentProject, setCurrentProject] = useState<KanbanProject | null>(null);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [selectedTask, setSelectedTaskState] = useState<KanbanTask | null>(null);
  const [taskComments, setTaskComments] = useState<KanbanComment[]>([]);
  const [taskHistory, setTaskHistory] = useState<KanbanHistoryEntry[]>([]);
  const [viewMode, setViewMode] = useState<KanbanViewMode>('board');
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);

  const tokenRef = useRef<string | null>(null);
  const pollingRef = useRef(false);
  const projectIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiFetch = useCallback(async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
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

  const handleEvent = useCallback((eventName: string, data: any) => {
    setMessagesReceived(p => p + 1);
    switch (eventName) {
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

  const startPolling = useCallback(() => {
    if (pollingRef.current || !tokenRef.current) return;
    pollingRef.current = true;
    setStatus('connected');

    const loop = async () => {
      while (pollingRef.current && tokenRef.current) {
        abortRef.current = new AbortController();
        try {
          const res = await fetch(`${BASE_URL}/poll?timeout=${POLL_TIMEOUT_MS}`, {
            headers: { Authorization: `Bearer ${tokenRef.current}` },
            signal: abortRef.current.signal,
          });

          if (res.status === 204) continue;
          if (!res.ok) throw new Error(res.statusText);

          const data = await res.json();
          if (data.activeUsers) setActiveUsers(data.activeUsers);
          for (const item of data.events || []) {
            handleEvent(item.event, item.data);
          }
        } catch (err) {
          if (!pollingRef.current) break;
          setStatus('error');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (pollingRef.current) setStatus('connected');
        }
      }
    };

    loop();
  }, [handleEvent]);

  const stopPolling = useCallback(() => {
    pollingRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      tokenRef.current = data.token;
      localStorage.setItem('kanban_lp_token', data.token);
      setCurrentUser(normalizeUser(data.user));

      const userProjects = await apiFetch('/api/projects');
      setProjects(userProjects.map(normalizeProject));
      startPolling();
    } catch (err: any) {
      setAuthError(err.message);
      setStatus('error');
    } finally {
      setAuthLoading(false);
    }
  }, [apiFetch, startPolling]);

  const logout = useCallback(() => {
    tokenRef.current = null;
    localStorage.removeItem('kanban_lp_token');
    stopPolling();
    if (pingRef.current) clearInterval(pingRef.current);
    setCurrentUser(null);
    setProjects([]);
    setCurrentProject(null);
    setTasks([]);
    setStatus('disconnected');
    projectIdRef.current = null;
  }, [stopPolling]);

  useEffect(() => {
    const saved = localStorage.getItem('kanban_lp_token');
    if (!saved) return;

    tokenRef.current = saved;
    apiFetch('/api/me')
      .then(data => {
        setCurrentUser(normalizeUser(data.user));
        setProjects(data.projects.map(normalizeProject));
        startPolling();
      })
      .catch(() => {
        localStorage.removeItem('kanban_lp_token');
        tokenRef.current = null;
        setStatus('disconnected');
      });

    return () => {
      stopPolling();
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [apiFetch, startPolling, stopPolling]);

  useEffect(() => {
    if (!tokenRef.current) return;
    pingRef.current = setInterval(async () => {
      const t0 = Date.now();
      try {
        await fetch(`${BASE_URL}/ping`);
        setLatency(Date.now() - t0);
      } catch {
        setStatus('error');
      }
    }, 5_000);
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [currentUser]);

  const selectProject = useCallback((projectId: string) => {
    if (!projectId) {
      setCurrentProject(null);
      projectIdRef.current = null;
      setTasks([]);
      return;
    }

    const proj = projects.find(p => p.id === projectId) ?? null;
    setCurrentProject(proj);
    projectIdRef.current = projectId;
    setTasks([]);

    apiFetch('/api/me/project', {
      method: 'PATCH',
      body: JSON.stringify({ projectId }),
    }).then(data => {
      setTasks(data.tasks.map(normalizeTask));
      setActiveUsers(data.activeUsers || []);
    }).catch(console.error);
  }, [projects, apiFetch]);

  const createTask = useCallback((data: CreateTaskData) => {
    apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ projectId: projectIdRef.current, ...data }),
    }).catch(console.error);
  }, [apiFetch]);

  const updateTask = useCallback((taskId: string, changes: Partial<KanbanTask>) => {
    apiFetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ projectId: projectIdRef.current, ...changes }),
    }).catch(console.error);
  }, [apiFetch]);

  const moveTask = useCallback((taskId: string, newStatus: TaskStatus, position?: number) => {
    apiFetch(`/api/tasks/${taskId}/move`, {
      method: 'POST',
      body: JSON.stringify({ projectId: projectIdRef.current, newStatus, position }),
    }).catch(console.error);
  }, [apiFetch]);

  const deleteTask = useCallback((taskId: string) => {
    apiFetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
      body: JSON.stringify({ projectId: projectIdRef.current }),
    }).catch(console.error);
  }, [apiFetch]);

  const selectTask = useCallback((taskId: string | null) => {
    if (!taskId) {
      setSelectedTaskState(null);
      return;
    }

    setSelectedTaskState(tasks.find(t => t.id === taskId) ?? null);
    setTaskComments([]);
    setTaskHistory([]);

    apiFetch(`/api/tasks/${taskId}/detail`)
      .then(data => {
        setTaskComments(data.comments.map(normalizeComment));
        setTaskHistory(data.history.map(normalizeHistory));
      })
      .catch(console.error);
  }, [tasks, apiFetch]);

  const addComment = useCallback((taskId: string, content: string) => {
    apiFetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ projectId: projectIdRef.current, content }),
    }).catch(console.error);
  }, [apiFetch]);

  return {
    technology: 'Long Polling',
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
