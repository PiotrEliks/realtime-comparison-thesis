import { Op } from 'sequelize';
import { sequelize } from '../../config/kanban/database';
import { Task, TaskComment, TaskHistory, User, Project } from '../../models/kanban';

const USER_ATTRS = ['id', 'username', 'displayName', 'avatarUrl', 'color', 'role'];

export class TaskService {

  async getProjectTasks(projectId: string) {
    return Task.findAll({
      where: { projectId },
      include: [
        { model: User, as: 'assignee', attributes: USER_ATTRS },
        { model: User, as: 'reporter', attributes: USER_ATTRS },
      ],
      order: [['status', 'ASC'], ['position', 'ASC']],
    });
  }

  async getTask(taskId: string) {
    return Task.findByPk(taskId, {
      include: [
        { model: User, as: 'assignee', attributes: USER_ATTRS },
        { model: User, as: 'reporter', attributes: USER_ATTRS },
      ],
    });
  }

  async createTask(projectId: string, userId: string, data: {
    title: string; description?: string; status?: string; priority?: string;
    type?: string; assigneeId?: string; storyPoints?: number; dueDate?: string; tags?: string[];
  }) {
    const taskNumber = await this.nextTaskNumber(projectId);
    const task = await Task.create({
      projectId, taskNumber, reporterId: userId,
      title:       data.title,
      description: data.description,
      status:      data.status      || 'new',
      priority:    data.priority    || 'medium',
      type:        data.type        || 'task',
      assigneeId:  data.assigneeId,
      storyPoints: data.storyPoints,
      dueDate:     data.dueDate     ? new Date(data.dueDate) : undefined,
      tags:        data.tags        || [],
      position:    await this.nextPosition(projectId, data.status || 'new'),
    });

    await TaskHistory.create({ taskId: task.id, userId, action: 'created' });
    return this.getTask(task.id);
  }

  async updateTask(taskId: string, userId: string, changes: Partial<{
    title: string; description: string; priority: string; type: string;
    assigneeId: string | null; storyPoints: number; dueDate: string; tags: string[];
  }>) {
    const task = await Task.findByPk(taskId);
    if (!task) throw new Error('Task not found');

    const historyEntries: object[] = [];
    for (const [key, val] of Object.entries(changes)) {
      const old = (task as any)[key];
      if (old !== val) historyEntries.push({ taskId, userId, action: 'updated', field: key, oldValue: String(old ?? ''), newValue: String(val ?? '') });
    }

    await task.update(changes as any);
    if (historyEntries.length) await TaskHistory.bulkCreate(historyEntries as any);
    return this.getTask(taskId);
  }

  async moveTask(taskId: string, userId: string, newStatus: string, position?: number) {
    const task = await Task.findByPk(taskId);
    if (!task) throw new Error('Task not found');
    const oldStatus = task.status;
    const newPos    = position ?? await this.nextPosition(task.projectId, newStatus);
    await task.update({ status: newStatus, position: newPos });
    await TaskHistory.create({ taskId, userId, action: 'status_changed', field: 'status', oldValue: oldStatus, newValue: newStatus });
    return this.getTask(taskId);
  }

  async deleteTask(taskId: string) {
    const task = await Task.findByPk(taskId);
    if (!task) throw new Error('Task not found');
    await task.destroy();
    return taskId;
  }

  async getComments(taskId: string) {
    return TaskComment.findAll({
      where: { taskId },
      include: [{ model: User, as: 'user', attributes: USER_ATTRS }],
      order: [['createdAt', 'ASC']],
    });
  }

  async addComment(taskId: string, userId: string, content: string) {
    const comment = await TaskComment.create({ taskId, userId, content });
    return TaskComment.findByPk(comment.id, {
      include: [{ model: User, as: 'user', attributes: USER_ATTRS }],
    });
  }

  async getHistory(taskId: string) {
    return TaskHistory.findAll({
      where: { taskId },
      include: [{ model: User, as: 'user', attributes: USER_ATTRS }],
      order: [['createdAt', 'DESC']],
    });
  }

  async getProjectMembers(projectId: string) {
    const result = await sequelize.query(
      `SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.color, u.role
       FROM users u JOIN project_members pm ON u.id = pm.user_id
       WHERE pm.project_id = :projectId`,
      { replacements: { projectId }, type: 'SELECT' }
    ) as any[];
    return result.map(r => ({
      id: r.id, username: r.username, email: r.email,
      displayName: r.display_name, avatarUrl: r.avatar_url, color: r.color, role: r.role,
    }));
  }

  async getUserProjects(userId: string) {
    const rows = await sequelize.query(
      `SELECT p.*, u.display_name as creator_name
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id
       LEFT JOIN users u ON p.created_by = u.id
       WHERE pm.user_id = :userId`,
      { replacements: { userId }, type: 'SELECT' }
    ) as any[];
    return rows;
  }

  private async nextTaskNumber(projectId: string): Promise<number> {
    const max = await Task.max<number, Task>('taskNumber', { where: { projectId } });
    return (max || 0) + 1;
  }

  private async nextPosition(projectId: string, status: string): Promise<number> {
    const max = await Task.max<number, Task>('position', { where: { projectId, status } });
    return (max || 0) + 1;
  }
}