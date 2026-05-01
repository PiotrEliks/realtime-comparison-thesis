// shared-server/src/types/whiteboard/index.ts

/**
 * Point on canvas
 */
export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

/**
 * Tool types
 */
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

/**
 * Shape definition
 */
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

/**
 * Text element
 */
export interface TextElement {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: string;
}

/**
 * Sticky note
 */
export interface StickyNote {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

/**
 * Drawing path (freehand)
 */
export interface DrawingPath {
  id: string;
  points: Point[];
  color: string;
  strokeWidth: number;
  tool: 'pen' | 'eraser';
  userId: string;
  timestamp: number;
}

/**
 * Canvas element (union type)
 */
export type CanvasElement = 
  | { type: 'path'; data: DrawingPath }
  | { type: 'shape'; data: Shape & { id: string; userId: string; timestamp: number } }
  | { type: 'text'; data: TextElement & { userId: string; timestamp: number } }
  | { type: 'sticky'; data: StickyNote & { userId: string; timestamp: number } };

/**
 * Draw event (real-time)
 */
export interface DrawEvent {
  type: 'draw-start' | 'draw-move' | 'draw-end' | 'shape-add' | 'text-add' | 'sticky-add' | 'element-delete' | 'clear-all';
  userId: string;
  username: string;
  displayName?: string;
  boardId: string;
  timestamp: number;
  
  points?: Point[];
  color?: string;
  strokeWidth?: number;
  tool?: ToolType;
  
  element?: CanvasElement;
  
  elementId?: string;
}

/**
 * User cursor position
 */
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

/**
 * Board state
 */
export interface BoardState {
  id: string;
  name: string;
  elements: CanvasElement[];
  thumbnail?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Board member
 */
export interface BoardMember {
  boardId: string;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: Date;
}

/**
 * User info
 */
export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  cursorColor?: string;
}

/**
 * WebSocket/SSE/LP message types - COMPLETE
 */
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
  
  // Pan & Zoom
  | 'PAN'
  | 'ZOOM'
  
  // Error
  | 'ERROR';

/**
 * Generic message structure
 */
export interface Message<T = any> {
  type: MessageType;
  payload: T;
  timestamp: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  technology: 'websocket' | 'sse' | 'longpolling' | 'webrtc';
  latency: number;
  throughput: number;
  drawingSmoothness: number;
  cursorsLatency: number;
  timestamp: number;
}

/**
 * Pan & Zoom state
 */
export interface ViewportState {
  offsetX: number;
  offsetY: number;
  scale: number;
}
