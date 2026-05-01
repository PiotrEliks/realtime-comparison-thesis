export { User }        from './User';
export { Project }     from './Project';
export { Task }        from './Task';
export { TaskComment } from './TaskComment';
export { TaskHistory } from './TaskHistory';

import { User }        from './User';
import { Project }     from './Project';
import { Task }        from './Task';
import { TaskComment } from './TaskComment';
import { TaskHistory } from './TaskHistory';

// Associations
Project.belongsTo(User,    { foreignKey: 'createdBy', as: 'creator' });
Task.belongsTo(Project,    { foreignKey: 'projectId', as: 'project' });
Task.belongsTo(User,       { foreignKey: 'assigneeId', as: 'assignee' });
Task.belongsTo(User,       { foreignKey: 'reporterId', as: 'reporter' });
TaskComment.belongsTo(Task, { foreignKey: 'taskId',   as: 'task' });
TaskComment.belongsTo(User, { foreignKey: 'userId',   as: 'user' });
TaskHistory.belongsTo(Task, { foreignKey: 'taskId',   as: 'task' });
TaskHistory.belongsTo(User, { foreignKey: 'userId',   as: 'user' });
Task.hasMany(TaskComment,   { foreignKey: 'taskId',   as: 'comments' });
Task.hasMany(TaskHistory,   { foreignKey: 'taskId',   as: 'history' });