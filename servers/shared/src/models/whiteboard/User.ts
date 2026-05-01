// shared-server/src/models/whiteboard/User.ts

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../config/whiteboard/database.js';

interface UserAttributes {
  id: string;
  username: string;
  email: string;
  passwordHash: string;  // ✅ FIXED: passwordHash zamiast password
  displayName?: string;
  avatarUrl?: string;
  cursorColor?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'createdAt' | 'updatedAt' | 'displayName' | 'avatarUrl' | 'cursorColor'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare username: string;
  declare email: string;
  declare passwordHash: string;  // ✅ FIXED
  declare displayName?: string;
  declare avatarUrl?: string;
  declare cursorColor?: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    passwordHash: {  // ✅ FIXED: passwordHash
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash'  // ✅ Map to snake_case in DB
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'display_name'
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'avatar_url'
    },
    cursorColor: {
      type: DataTypes.STRING(7),
      allowNull: true,
      field: 'cursor_color',
      defaultValue: () => {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
        return colors[Math.floor(Math.random() * colors.length)];
      }
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    underscored: true
  }
);
