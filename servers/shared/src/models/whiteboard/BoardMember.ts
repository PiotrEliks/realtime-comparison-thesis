// shared-server/src/models/whiteboard/BoardMember.ts

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../config/whiteboard/database.js';

interface BoardMemberAttributes {
  id: string;
  boardId: string;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: Date;
}

interface BoardMemberCreationAttributes extends Optional<BoardMemberAttributes, 'id' | 'joinedAt'> {}

export class BoardMember extends Model<BoardMemberAttributes, BoardMemberCreationAttributes> implements BoardMemberAttributes {
  declare id: string;
  declare boardId: string;
  declare userId: string;
  declare role: 'owner' | 'editor' | 'viewer';
  declare joinedAt: Date;
}

BoardMember.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    boardId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'board_id',  // ✅ Map to snake_case
      references: {
        model: 'boards',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',  // ✅ Map to snake_case
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    role: {
      type: DataTypes.ENUM('owner', 'editor', 'viewer'),
      allowNull: false,
      defaultValue: 'editor'
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'joined_at'  // ✅ Map to snake_case
    }
  },
  {
    sequelize,
    tableName: 'board_members',
    timestamps: false,
    underscored: true,  // ✅ IMPORTANT
    indexes: [
      {
        unique: true,
        fields: ['board_id', 'user_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['board_id']
      }
    ]
  }
);
