// ─── Enums / constants ────────────────────────────────────────────────────────

export const TASK_STATUSES = [
  { id: 'new',          label: 'New',          color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  { id: 'todo',         label: 'To Do',        color: '#6366f1', bg: 'rgba(99,102,241,0.12)'  },
  { id: 'to_fix',       label: 'To Fix',       color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  { id: 'verification', label: 'Verification', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  { id: 'fixed',        label: 'Fixed',        color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'   },
  { id: 'to_merge',     label: 'To Merge',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  { id: 'committed',    label: 'Committed',    color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  { id: 'to_deploy',    label: 'To Deploy',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  { id: 'done',         label: 'Done',         color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  { id: 'rejected',     label: 'Rejected',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
] as const;

export type TaskStatus = typeof TASK_STATUSES[number]['id'];

export const TASK_PRIORITIES = [
  { id: 'critical', label: 'Critical', color: '#ef4444', icon: '🔴' },
  { id: 'high',     label: 'High',     color: '#f97316', icon: '🟠' },
  { id: 'medium',   label: 'Medium',   color: '#f59e0b', icon: '🟡' },
  { id: 'low',      label: 'Low',      color: '#22c55e', icon: '🟢' },
] as const;

export type TaskPriority = typeof TASK_PRIORITIES[number]['id'];

export const TASK_TYPES = [
  { id: 'feature',     label: 'Feature',     icon: '⚡', color: '#6366f1' },
  { id: 'bug',         label: 'Bug',         icon: '🐛', color: '#ef4444' },
  { id: 'task',        label: 'Task',        icon: '📋', color: '#64748b' },
  { id: 'improvement', label: 'Improvement', icon: '🔧', color: '#10b981' },
  { id: 'docs',        label: 'Docs',        icon: '📚', color: '#f59e0b' },
] as const;

export type TaskType = typeof TASK_TYPES[number]['id'];

// ─── Data models ──────────────────────────────────────────────────────────────

export interface KanbanUser {
  id:          string;
  username:    string;
  email:       string;
  displayName: string;
  avatarUrl?:  string;
  color:       string;
  role:        'admin' | 'member';
}

export interface KanbanProject {
  id:          string;
  name:        string;
  key:         string;   // e.g. 'RT'
  description?: string;
  createdBy:   string;
  members:     KanbanUser[];
}

export interface KanbanTask {
  id:          string;
  projectId:   string;
  taskNumber:  number;
  title:       string;
  description?: string;
  status:      TaskStatus;
  priority:    TaskPriority;
  type:        TaskType;
  assigneeId?: string;
  reporterId?: string;
  storyPoints?: number;
  dueDate?:    string;
  tags:        string[];
  position:    number;
  createdAt:   string;
  updatedAt:   string;
  // Joined
  assignee?:   KanbanUser;
  reporter?:   KanbanUser;
  commentCount?: number;
}

export interface KanbanComment {
  id:        string;
  taskId:    string;
  userId:    string;
  content:   string;
  createdAt: string;
  updatedAt: string;
  user?:     KanbanUser;
}

export interface KanbanHistoryEntry {
  id:        string;
  taskId:    string;
  userId?:   string;
  action:    string;
  field?:    string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
  user?:     KanbanUser;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export type KanbanViewMode = 'board' | 'assignee';

export interface CreateTaskData {
  title:       string;
  description?: string;
  status:      TaskStatus;
  priority:    TaskPriority;
  type:        TaskType;
  assigneeId?: string;
  storyPoints?: number;
  dueDate?:    string;
  tags?:       string[];
}

export interface IKanbanAdapter {
  technology: string;
  status:     'disconnected' | 'connecting' | 'connected' | 'error';

  // ─── Auth ──
  currentUser:  KanbanUser | null;
  authError:    string | null;
  authLoading:  boolean;
  login:        (username: string, password: string) => Promise<void>;
  logout:       () => void;

  // ─── Project ──
  projects:       KanbanProject[];
  currentProject: KanbanProject | null;
  selectProject:  (projectId: string) => void;

  // ─── Tasks ──
  tasks:      KanbanTask[];
  createTask: (data: CreateTaskData) => void;
  updateTask: (taskId: string, changes: Partial<KanbanTask>) => void;
  moveTask:   (taskId: string, newStatus: TaskStatus, position?: number) => void;
  deleteTask: (taskId: string) => void;

  // ─── Task detail ──
  selectedTask:  KanbanTask | null;
  taskComments:  KanbanComment[];
  taskHistory:   KanbanHistoryEntry[];
  selectTask:    (taskId: string | null) => void;
  addComment:    (taskId: string, content: string) => void;

  // ─── View ──
  viewMode:    KanbanViewMode;
  setViewMode: (mode: KanbanViewMode) => void;
  filterUser:  string | null;    // filter tasks by assignee
  setFilterUser: (userId: string | null) => void;

  // ─── RT presence ──
  activeUsers: string[];   // user IDs currently connected

  // ─── Stats ──
  messagesReceived: number;
  latency:          number | null;
}