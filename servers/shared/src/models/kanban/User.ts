import { Model, DataTypes, Optional } from 'sequelize';
import bcrypt from 'bcryptjs';
import { sequelize } from '../../config/kanban/database';

interface UserAttributes {
  id:           string;
  username:     string;
  email:        string;
  passwordHash: string;
  displayName:  string;
  avatarUrl?:   string;
  color:        string;
  role:         string;
  createdAt?:   Date;
  updatedAt?:   Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'color' | 'role'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> {
  declare id:           string;
  declare username:     string;
  declare email:        string;
  declare passwordHash: string;
  declare displayName:  string;
  declare avatarUrl:    string | undefined;
  declare color:        string;
  declare role:         string;

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.passwordHash);
  }

  toPublic() {
    return {
      id:          this.id,
      username:    this.username,
      email:       this.email,
      displayName: this.displayName,
      avatarUrl:   this.avatarUrl,
      color:       this.color,
      role:        this.role,
    };
  }
}

User.init({
  id:           { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  username:     { type: DataTypes.STRING(50), unique: true, allowNull: false },
  email:        { type: DataTypes.STRING(255), unique: true, allowNull: false },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
  displayName:  { type: DataTypes.STRING(100), field: 'display_name' },
  avatarUrl:    { type: DataTypes.STRING(500), field: 'avatar_url' },
  color:        { type: DataTypes.STRING(7),   defaultValue: '#6366f1' },
  role:         { type: DataTypes.STRING(20),  defaultValue: 'member' },
}, {
  sequelize, tableName: 'users',
  underscored: true,
});