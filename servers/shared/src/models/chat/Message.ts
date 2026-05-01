import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../config/chat/database';

interface MessageAttributes {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  type: 'text' | 'system' | 'file';
  isDeleted: boolean;           // NOWE
  isEdited: boolean;            // NOWE
  editedAt?: Date;      
  replyToId?: string;        // NOWE
  createdAt?: Date;
  updatedAt?: Date;
  fileUrl?: string;      // NOWE
  fileName?: string;     // NOWE
  fileSize?: number;     // NOWE
  fileMimeType?: string;
}

interface MessageCreationAttributes extends Optional<MessageAttributes, 'id' | 'type' | 'isDeleted' | 'isEdited' | 'createdAt' | 'updatedAt'> {}

export class Message extends Model<MessageAttributes, MessageCreationAttributes> implements MessageAttributes {
  declare id: string;
  declare roomId: string;
  declare userId: string;
  declare content: string;
  declare type: 'text' | 'system' | 'file';
  declare isDeleted: boolean;
  declare isEdited: boolean;
  declare editedAt?: Date;
  declare replyToId?: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare fileUrl?: string;
  declare fileName?: string;
  declare fileSize?: number;
  declare fileMimeType?: string;
}

Message.init(
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(20),
      defaultValue: 'text'
    },
    isDeleted: {                // NOWE
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_deleted'
    },
    isEdited: {                 // NOWE
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_edited'
    },
    editedAt: {                 // NOWE
      type: DataTypes.DATE,
      field: 'edited_at'
    },
    replyToId: {                // NOWE
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reply_to_id',
      references: {
        model: 'messages',
        key: 'id'
      },
      onDelete: 'SET NULL'      // Jeśli oryginał zostanie usunięty, reply dalej istnieje
    },
    fileUrl: {
      type: DataTypes.STRING(500),
      field: 'file_url'
    },
    fileName: {
      type: DataTypes.STRING(255),
      field: 'file_name'
    },
    fileSize: {
      type: DataTypes.INTEGER,
      field: 'file_size'
    },
    fileMimeType: {
      type: DataTypes.STRING(100),
      field: 'file_mime_type'
    }
  },
  {
    sequelize,
    tableName: 'messages',
    underscored: true
  }
);