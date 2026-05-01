import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../config/chat/database';
import { Room } from './Room.js'; // Import Room for typing
import { User } from './User.js'; // Import User for typing

interface RoomMemberAttributes {
  id: string;
  roomId: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt?: Date;
}

interface RoomMemberCreationAttributes extends Optional<RoomMemberAttributes, 'id' | 'role' | 'joinedAt'> {}

export class RoomMember extends Model<RoomMemberAttributes, RoomMemberCreationAttributes> implements RoomMemberAttributes {
  declare id: string;
  declare roomId: string;
  declare userId: string;
  declare role: 'admin' | 'member';
  declare readonly joinedAt: Date;
  declare readonly room?: Room; 
  declare readonly user?: User;
}

RoomMember.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    roomId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'room_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    role: {
      type: DataTypes.STRING(20),
      defaultValue: 'member'
    },
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'joined_at'
    }
  },
  {
    sequelize,
    tableName: 'room_members',
    underscored: true,
    timestamps: false
  }
);