// shared-server/src/models/whiteboard/index.ts

import { User } from './User.js';
import { Board } from './Board.js';
import { BoardMember } from './BoardMember.js';

/**
 * Define model associations
 */
export function initializeAssociations() {
  // User has many Boards (created)
  User.hasMany(Board, {
    foreignKey: 'createdBy',
    as: 'createdBoards'
  });

  Board.belongsTo(User, {
    foreignKey: 'createdBy',
    as: 'creator'
  });

  // Board has many BoardMembers
  Board.hasMany(BoardMember, {
    foreignKey: 'boardId',
    as: 'members'
  });

  BoardMember.belongsTo(Board, {
    foreignKey: 'boardId',
    as: 'board'
  });

  // User has many BoardMembers
  User.hasMany(BoardMember, {
    foreignKey: 'userId',
    as: 'boardMemberships'
  });

  BoardMember.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
  });

  console.log('✅ Whiteboard model associations initialized');
}

// Export Sequelize models
export { User, Board, BoardMember };

// Export TypeScript types (z osobnego pliku)
export type {
  Point,
  ToolType,
  Shape,
  TextElement,
  StickyNote,
  DrawingPath,
  CanvasElement,
  DrawEvent,
  CursorPosition,
  BoardState,
  MessageType,
  Message,
  PerformanceMetrics
} from '../../types/whiteboard/index.js';
