// shared-server/src/models/whiteboard/Board.ts

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../config/whiteboard/database.js';

// Import types z osobnego pliku typów
export interface CanvasElement {
  type: 'path' | 'shape' | 'text' | 'sticky';
  data: any;
}

interface BoardAttributes {
  id: string;
  name: string;
  description?: string;
  elements: CanvasElement[];
  thumbnail?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface BoardCreationAttributes extends Optional<BoardAttributes, 'id' | 'createdAt' | 'updatedAt' | 'elements' | 'description' | 'thumbnail'> {}

export class Board extends Model<BoardAttributes, BoardCreationAttributes> implements BoardAttributes {
  declare id: string;
  declare name: string;
  declare description?: string;
  declare elements: CanvasElement[];
  declare thumbnail?: string;
  declare createdBy: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Board.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    elements: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    thumbnail: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      field: 'created_by'  // ✅ Map to snake_case
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at'  // ✅ Map to snake_case
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at'  // ✅ Map to snake_case
    }
  },
  {
    sequelize,
    tableName: 'boards',
    timestamps: true,
    underscored: true,  // ✅ IMPORTANT: Convert camelCase to snake_case
    indexes: [
      {
        fields: ['created_by']
      }
    ]
  }
);
