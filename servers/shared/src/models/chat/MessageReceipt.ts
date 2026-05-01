import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../config/chat/database';

interface MessageReceiptAttributes {
  id: string;
  messageId: string;
  userId: string;
  readAt: Date;
}

interface MessageReceiptCreationAttributes extends Optional<MessageReceiptAttributes, 'id'> {}

export class MessageReceipt extends Model<MessageReceiptAttributes, MessageReceiptCreationAttributes> implements MessageReceiptAttributes {
  declare id: string;
  declare messageId: string;
  declare userId: string;
  declare readonly readAt: Date;
}

MessageReceipt.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'message_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    readAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'read_at'
    }
  },
  {
    sequelize,
    tableName: 'message_receipts',
    underscored: true,
    timestamps: false
  }
);