// src/types/index.ts

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export type ToolType = 
  | 'pen'
  | 'eraser'
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky-note'
  | 'select'
  | 'pan';

export interface Shape {
  type: 'rectangle' | 'circle' | 'triangle' | 'line' | 'arrow';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  x2?: number;
  y2?: number;
  color: string;
  strokeWidth: number;
  filled?: boolean;
}

export interface TextElement {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: string;
}

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

export interface DrawingPath {
  id: string;
  points: Point[];
  color: string;
  strokeWidth: number;
  tool: 'pen' | 'eraser';
  userId: string;
  timestamp: number;
}

export type CanvasElement = 
  | { type: 'path'; data: DrawingPath }
  | { type: 'shape'; data: Shape & { id: string; userId: string; timestamp: number } }
  | { type: 'text'; data: TextElement & { userId: string; timestamp: number } }
  | { type: 'sticky'; data: StickyNote & { userId: string; timestamp: number } };

export interface CursorPosition {
  userId: string;
  username: string;
  displayName?: string;
  color: string;
  x: number;
  y: number;
  tool?: ToolType;
  timestamp: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  cursorColor?: string;
}

export interface Board {
  id: string;
  name: string;
  description?: string;
  elements: CanvasElement[];
  thumbnail?: string;
  createdBy: string;
  role?: 'owner' | 'editor' | 'viewer';
  creator?: {
    id: string;
    username: string;
    displayName?: string;
  };
}

export interface BoardMember {
  userId: string;
  username: string;
  displayName?: string;
  cursorColor: string;
}

export type MessageType =
  // Connection
  | 'CONNECTED'
  | 'BOARD_JOINED'
  | 'BOARD_LEFT'
  | 'USER_JOINED'
  | 'USER_LEFT'
  
  // Cursor
  | 'CURSOR_MOVE'
  
  // Drawing
  | 'DRAW_START'
  | 'DRAW_MOVE'
  | 'DRAW_END'
  
  // Elements
  | 'ELEMENT_ADD'
  | 'ELEMENT_UPDATE'
  | 'ELEMENT_DELETE'
  
  // Text
  | 'TEXT_ADD'
  | 'TEXT_UPDATE'
  
  // Sticky notes
  | 'STICKY_ADD'
  | 'STICKY_UPDATE'
  
  // Board actions
  | 'CLEAR_BOARD'
  | 'BOARD_STATE'
  
  // Undo/Redo
  | 'UNDO'
  | 'REDO'
  
  // Export
  | 'EXPORT_PNG'
  | 'EXPORT_SUCCESS'
  
  // ✅ NEW: Membership notifications
  | 'BOARD_MEMBER_ADDED'
  | 'BOARD_MEMBER_REMOVED'
  | 'BOARD_ACCESS_REVOKED'
  
  // Error
  | 'ERROR';

export interface Message<T = any> {
  type: MessageType;
  payload: T;
  timestamp: number;
}
