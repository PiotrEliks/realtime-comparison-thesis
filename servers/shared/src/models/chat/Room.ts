import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../config/chat/database';

interface RoomAttributes {
  id: string;
  name?: string;
  type: 'private' | 'group';
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RoomCreationAttributes extends Optional<RoomAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

export class Room extends Model<RoomAttributes, RoomCreationAttributes> implements RoomAttributes {
  declare id: string;
  declare name?: string;
  declare type: 'private' | 'group';
  declare createdBy: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Room.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['private', 'group']]
      }
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by'
    }
  },
  {
    sequelize,
    tableName: 'rooms',
    underscored: true
  }
);