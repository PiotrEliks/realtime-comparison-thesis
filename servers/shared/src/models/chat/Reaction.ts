import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../config/chat/database';

interface ReactionAttributes {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt?: Date;
}

interface ReactionCreationAttributes extends Optional<ReactionAttributes, 'id' | 'createdAt'> {}

export class Reaction extends Model<ReactionAttributes, ReactionCreationAttributes> implements ReactionAttributes {
  declare id: string;
  declare messageId: string;
  declare userId: string;
  declare emoji: string;
  declare readonly createdAt: Date;
}

Reaction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'message_id',
      references: {
        model: 'messages',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    emoji: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    sequelize,
    tableName: 'reactions',
    underscored: true,
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['message_id', 'user_id', 'emoji']
      }
    ]
  }
);