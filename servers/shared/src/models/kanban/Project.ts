import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../config/kanban/database';

interface ProjectAttributes {
  id:          string;
  name:        string;
  key:         string;
  description?: string;
  createdBy?:  string;
  createdAt?:  Date;
  updatedAt?:  Date;
}

interface ProjectCreationAttributes extends Optional<ProjectAttributes, 'id'> {}

export class Project extends Model<ProjectAttributes, ProjectCreationAttributes> {
  declare id:          string;
  declare name:        string;
  declare key:         string;
  declare description: string | undefined;
  declare createdBy:   string | undefined;
}

Project.init({
  id:          { type: DataTypes.UUID,        primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  name:        { type: DataTypes.STRING(200), allowNull: false },
  key:         { type: DataTypes.STRING(10),  unique: true, allowNull: false },
  description: { type: DataTypes.TEXT },
  createdBy:   { type: DataTypes.UUID, field: 'created_by' },
}, {
  sequelize, tableName: 'projects', underscored: true,
});