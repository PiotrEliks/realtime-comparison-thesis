import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../config/kanban/database';

interface CommentAttributes {
  id:        string;
  taskId:    string;
  userId:    string;
  content:   string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CommentCreationAttributes extends Optional<CommentAttributes, 'id'> {}

export class TaskComment extends Model<CommentAttributes, CommentCreationAttributes> {
  declare id:      string;
  declare taskId:  string;
  declare userId:  string;
  declare content: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

TaskComment.init({
  id:      { type: DataTypes.UUID,  primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  taskId:  { type: DataTypes.UUID,  allowNull: false, field: 'task_id' },
  userId:  { type: DataTypes.UUID,  allowNull: false, field: 'user_id' },
  content: { type: DataTypes.TEXT,  allowNull: false },
}, {
  sequelize, tableName: 'task_comments', underscored: true,
});