import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../config/chat/database';
import bcrypt from 'bcrypt';

interface UserAttributes {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName?: string;
  avatarUrl?: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'status' | 'createdAt' | 'updatedAt'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare username: string;
  declare email: string;
  declare passwordHash: string;
  declare displayName?: string;
  declare avatarUrl?: string;
  declare status: 'online' | 'offline' | 'away';
  declare lastSeen?: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.passwordHash);
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  toJSON() {
    const values = { ...this.get() };
    delete values.passwordHash;
    return values;
  }
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
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash'
    },
    displayName: {
      type: DataTypes.STRING(100),
      field: 'display_name'
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      field: 'avatar_url'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'offline'
    },
    lastSeen: {
      type: DataTypes.DATE,
      field: 'last_seen'
    }
  },
  {
    sequelize,
    tableName: 'users',
    underscored: true
  }
);
