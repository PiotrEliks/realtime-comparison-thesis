import { WebSocket, WebSocketServer } from 'ws';
import { AuthService } from '@realtime-thesis/shared-server/services/kanban/AuthService';
import { TaskService }  from '@realtime-thesis/shared-server/services/kanban/TaskService';
import type { User }    from '@realtime-thesis/shared-server/models/kanban';

// ─── Protocol types ───────────────────────────────────────────────────────────

type ClientMsg =
  | { type: 'AUTH';           token: string }
  | { type: 'SELECT_PROJECT'; projectId: string }
  | { type: 'CREATE_TASK';    data: any }
  | { type: 'UPDATE_TASK';    taskId: string; changes: any }
  | { type: 'MOVE_TASK';      taskId: string; newStatus: string; position?: number }
  | { type: 'DELETE_TASK';    taskId: string }
  | { type: 'ADD_COMMENT';    taskId: string; content: string }
  | { type: 'LOAD_TASK';      taskId: string }
  | { type: 'PING';           timestamp: number };

type ServerMsg = { type: string; [key: string]: any };

// ─── Connected client ─────────────────────────────────────────────────────────

interface Client {
  id:        string;
  ws:        WebSocket;
  user?:     User;
  projectId?: string;
  connectedAt: number;
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export class KanbanManager {
  private clients  = new Map<string, Client>();
  private auth     = new AuthService();
  private tasks    = new TaskService();

  constructor(private wss: WebSocketServer) {
    wss.on('connection', ws => this.onConnect(ws));
    console.log('📋 KanbanManager ready');
  }

  private onConnect(ws: WebSocket) {
    const id: string = crypto.randomUUID().slice(0, 8);
    this.clients.set(id, { id, ws, connectedAt: Date.now() });

    this.send(ws, { type: 'HELLO', clientId: id, message: 'Send AUTH to authenticate' });

    ws.on('message', raw => {
      try { this.onMessage(id, JSON.parse(raw.toString()) as ClientMsg); }
      catch (e) { this.send(ws, { type: 'ERROR', message: 'Invalid JSON' }); }
    });

    ws.on('close', () => this.onDisconnect(id));
    ws.on('error', () => this.onDisconnect(id));
  }

  private async onMessage(clientId: string, msg: ClientMsg) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // AUTH must come first
    if (msg.type !== 'AUTH' && !client.user) {
      this.send(client.ws, { type: 'ERROR', message: 'Not authenticated' });
      return;
    }

    try {
      switch (msg.type) {

        case 'AUTH': {
          const user = await this.auth.getUserFromToken(msg.token);
          if (!user) { this.send(client.ws, { type: 'AUTH_ERROR', message: 'Invalid token' }); return; }
          client.user = user;
          // Send user's projects
          const projects = await this.tasks.getUserProjects(user.id);
          this.send(client.ws, { type: 'AUTHENTICATED', user: user.toPublic(), projects });
          console.log(`✅ [${clientId}] auth as ${user.username}`);
          break;
        }

        case 'SELECT_PROJECT': {
          client.projectId = msg.projectId;
          const [taskList, members] = await Promise.all([
            this.tasks.getProjectTasks(msg.projectId),
            this.tasks.getProjectMembers(msg.projectId),
          ]);
          this.send(client.ws, {
            type:    'PROJECT_LOADED',
            tasks:   taskList.map(t => t.toJSON()),
            members,
            activeUsers: this.getActiveUsers(msg.projectId),
          });
          // Notify others someone joined
          this.broadcastToProject(msg.projectId, {
            type:     'USER_JOINED',
            userId:   client.user!.id,
            username: client.user!.username,
            activeUsers: this.getActiveUsers(msg.projectId),
          }, clientId);
          break;
        }

        case 'CREATE_TASK': {
          const task = await this.tasks.createTask(client.projectId!, client.user!.id, msg.data);
          this.broadcastToProject(client.projectId!, { type: 'TASK_CREATED', task: task?.toJSON() });
          break;
        }

        case 'UPDATE_TASK': {
          const task = await this.tasks.updateTask(msg.taskId, client.user!.id, msg.changes);
          this.broadcastToProject(client.projectId!, { type: 'TASK_UPDATED', task: task?.toJSON() });
          break;
        }

        case 'MOVE_TASK': {
          const task = await this.tasks.moveTask(msg.taskId, client.user!.id, msg.newStatus, msg.position);
          this.broadcastToProject(client.projectId!, {
            type: 'TASK_MOVED', task: task?.toJSON(),
            taskId: msg.taskId, newStatus: msg.newStatus,
          });
          break;
        }

        case 'DELETE_TASK': {
          await this.tasks.deleteTask(msg.taskId);
          this.broadcastToProject(client.projectId!, { type: 'TASK_DELETED', taskId: msg.taskId });
          break;
        }

        case 'ADD_COMMENT': {
          const comment = await this.tasks.addComment(msg.taskId, client.user!.id, msg.content);
          this.broadcastToProject(client.projectId!, {
            type: 'COMMENT_ADDED', taskId: msg.taskId, comment: comment?.toJSON(),
          });
          break;
        }

        case 'LOAD_TASK': {
          const [comments, history] = await Promise.all([
            this.tasks.getComments(msg.taskId),
            this.tasks.getHistory(msg.taskId),
          ]);
          this.send(client.ws, {
            type: 'TASK_DETAIL',
            taskId:   msg.taskId,
            comments: comments.map(c => c.toJSON()),
            history:  history.map(h => h.toJSON()),
          });
          break;
        }

        case 'PING':
          this.send(client.ws, { type: 'PONG', timestamp: msg.timestamp });
          break;
      }
    } catch (err: any) {
      console.error(`[${clientId}]`, err.message);
      this.send(client.ws, { type: 'ERROR', message: err.message });
    }
  }

  private onDisconnect(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.clients.delete(clientId);
    if (client.user && client.projectId) {
      this.broadcastToProject(client.projectId, {
        type:     'USER_LEFT',
        userId:   client.user.id,
        activeUsers: this.getActiveUsers(client.projectId),
      });
    }
    console.log(`❌ [${clientId}] disconnected`);
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  private broadcastToProject(projectId: string, msg: ServerMsg, excludeId?: string) {
    const payload = JSON.stringify(msg);
    this.clients.forEach(c => {
      if (c.projectId === projectId && c.id !== excludeId && c.ws.readyState === WebSocket.OPEN)
        c.ws.send(payload);
    });
  }

  private getActiveUsers(projectId: string): string[] {
    const users: string[] = [];
    this.clients.forEach(c => {
      if (c.projectId === projectId && c.user) users.push(c.user.id);
    });
    return [...new Set(users)];
  }

  stats() {
    return { clients: this.clients.size };
  }
}