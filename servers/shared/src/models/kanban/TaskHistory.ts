import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../config/kanban/database';

interface HistoryAttributes {
  id:        string;
  taskId:    string;
  userId?:   string;
  action:    string;
  field?:    string;
  oldValue?: string;
  newValue?: string;
  createdAt?: Date;
}

interface HistoryCreationAttributes extends Optional<HistoryAttributes, 'id'> {}

export class TaskHistory extends Model<HistoryAttributes, HistoryCreationAttributes> {
  declare id:       string;
  declare taskId:   string;
  declare userId:   string | undefined;
  declare action:   string;
  declare field:    string | undefined;
  declare oldValue: string | undefined;
  declare newValue: string | undefined;
  declare createdAt: Date;
}

TaskHistory.init({
  id:       { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  taskId:   { type: DataTypes.UUID, allowNull: false, field: 'task_id' },
  userId:   { type: DataTypes.UUID, field: 'user_id' },
  action:   { type: DataTypes.STRING(50), allowNull: false },
  field:    { type: DataTypes.STRING(50) },
  oldValue: { type: DataTypes.TEXT, field: 'old_value' },
  newValue: { type: DataTypes.TEXT, field: 'new_value' },
}, {
  sequelize, tableName: 'task_history', underscored: true, updatedAt: false,
});