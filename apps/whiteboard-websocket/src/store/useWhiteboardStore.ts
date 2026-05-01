// src/store/useWhiteboardStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  ToolType, 
  CanvasElement, 
  CursorPosition, 
  User, 
  Board,
  BoardMember 
} from '../types';

interface WhiteboardState {
  // Auth (persisted!)
  user: User | null;
  token: string | null;
  setUser: (user: User | null, token: string | null) => void;
  
  // Current board
  currentBoard: Board | null;
  setCurrentBoard: (board: Board | null) => void;
  
  // Canvas elements
  elements: CanvasElement[];
  setElements: (elements: CanvasElement[]) => void;
  addElement: (element: CanvasElement) => void;
  updateElement: (elementId: string, changes: Partial<CanvasElement>) => void;
  deleteElement: (elementId: string) => void;
  clearElements: () => void;
  
  // Drawing state
  isDrawing: boolean;
  currentPath: { x: number; y: number }[];
  setIsDrawing: (isDrawing: boolean) => void;
  setCurrentPath: (path: { x: number; y: number }[]) => void;
  
  // Tool state
  selectedTool: ToolType;
  selectedColor: string;
  strokeWidth: number;
  setSelectedTool: (tool: ToolType) => void;
  setSelectedColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  
  // Users & Cursors
  onlineUsers: BoardMember[];
  cursors: Map<string, CursorPosition>;
  setOnlineUsers: (users: BoardMember[]) => void;
  updateCursor: (userId: string, cursor: CursorPosition) => void;
  removeCursor: (userId: string) => void;
  
  // WebSocket
  ws: WebSocket | null;
  isConnected: boolean;
  setWebSocket: (ws: WebSocket | null) => void;
  setIsConnected: (connected: boolean) => void;
}

export const useWhiteboardStore = create<WhiteboardState>()(
  persist(
    (set, get) => ({
      // Auth
      user: null,
      token: null,
      setUser: (user, token) => set({ user, token }),
      
      // Board
      currentBoard: null,
      setCurrentBoard: (board) => set({ currentBoard: board }),
      
      // Elements
      elements: [],
      setElements: (elements) => set({ elements }),
      addElement: (element) => set((state) => ({ 
        elements: [...state.elements, element] 
      })),
      updateElement: (elementId, changes) => set((state) => ({
        elements: state.elements.map(el => {
          const elId = el.data.id;
          if (elId === elementId) {
            return { ...el, data: { ...el.data, ...changes } };
          }
          return el;
        })
      })),
      deleteElement: (elementId) => set((state) => ({
        elements: state.elements.filter(el => el.data.id !== elementId)
      })),
      clearElements: () => set({ elements: [] }),
      
      // Drawing
      isDrawing: false,
      currentPath: [],
      setIsDrawing: (isDrawing) => set({ isDrawing }),
      setCurrentPath: (path) => set({ currentPath: path }),
      
      // Tools
      selectedTool: 'pen',
      selectedColor: '#000000',
      strokeWidth: 2,
      setSelectedTool: (tool) => set({ selectedTool: tool }),
      setSelectedColor: (color) => set({ selectedColor: color }),
      setStrokeWidth: (width) => set({ strokeWidth: width }),
      
      // Users
      onlineUsers: [],
      cursors: new Map(),
      setOnlineUsers: (users) => set({ onlineUsers: users }),
      updateCursor: (userId, cursor) => set((state) => {
        const newCursors = new Map(state.cursors);
        newCursors.set(userId, cursor);
        return { cursors: newCursors };
      }),
      removeCursor: (userId) => set((state) => {
        const newCursors = new Map(state.cursors);
        newCursors.delete(userId);
        return { cursors: newCursors };
      }),
      
      // WebSocket
      ws: null,
      isConnected: false,
      setWebSocket: (ws) => set({ ws }),
      setIsConnected: (connected) => set({ isConnected: connected })
    }),
    {
      name: 'whiteboard-storage', // localStorage key
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token 
      }) // Only persist auth data
    }
  )
);