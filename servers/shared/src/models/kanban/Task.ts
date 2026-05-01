import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../config/kanban/database';

export interface TaskAttributes {
  id:           string;
  projectId:    string;
  taskNumber:   number;
  title:        string;
  description?: string;
  status:       string;
  priority:     string;
  type:         string;
  assigneeId?:  string;
  reporterId?:  string;
  storyPoints?: number;
  dueDate?:     Date;
  tags:         string[];
  position:     number;
  createdAt?:   Date;
  updatedAt?:   Date;
}

interface TaskCreationAttributes extends Optional<TaskAttributes, 'id' | 'status' | 'priority' | 'type' | 'tags' | 'position'> {}

export class Task extends Model<TaskAttributes, TaskCreationAttributes> {
  declare id:           string;
  declare projectId:    string;
  declare taskNumber:   number;
  declare title:        string;
  declare description:  string | undefined;
  declare status:       string;
  declare priority:     string;
  declare type:         string;
  declare assigneeId:   string | undefined;
  declare reporterId:   string | undefined;
  declare storyPoints:  number | undefined;
  declare dueDate:      Date | undefined;
  declare tags:         string[];
  declare position:     number;
  declare createdAt:    Date;
  declare updatedAt:    Date;
}

Task.init({
  id:          { type: DataTypes.UUID,        primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  projectId:   { type: DataTypes.UUID,        allowNull: false, field: 'project_id' },
  taskNumber:  { type: DataTypes.INTEGER,     allowNull: false, field: 'task_number' },
  title:       { type: DataTypes.STRING(500), allowNull: false },
  description: { type: DataTypes.TEXT },
  status:      { type: DataTypes.STRING(20),  defaultValue: 'new' },
  priority:    { type: DataTypes.STRING(10),  defaultValue: 'medium' },
  type:        { type: DataTypes.STRING(20),  defaultValue: 'task' },
  assigneeId:  { type: DataTypes.UUID, field: 'assignee_id' },
  reporterId:  { type: DataTypes.UUID, field: 'reporter_id' },
  storyPoints: { type: DataTypes.INTEGER,     field: 'story_points' },
  dueDate:     { type: DataTypes.DATEONLY,    field: 'due_date' },
  tags:        { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  position:    { type: DataTypes.INTEGER,     defaultValue: 0 },
}, {
  sequelize, tableName: 'tasks', underscored: true,
});