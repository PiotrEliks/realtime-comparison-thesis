// websocket-whiteboard-server/src/services/WhiteboardWebSocketServer.ts

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { 
  User, 
  Board, 
  BoardMember 
} from '@realtime-thesis/shared-server/models/whiteboard';

import type {
  DrawEvent, 
  CursorPosition, 
  CanvasElement,
  Message,
  MessageType,
  TextElement,
  StickyNote,
  Point
} from '@realtime-thesis/shared-server/types/whiteboard';

interface Client {
  ws: WebSocket;
  userId: string;
  user: User;
  boardId: string | null;
  cursorColor: string;
}

export class WhiteboardWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private boardClients: Map<string, Set<string>> = new Map();
  private boardHistory: Map<string, CanvasElement[][]> = new Map(); // For undo/redo

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    console.log(`🎨 Whiteboard WebSocket Server started on port ${port}`);

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    console.log('🔗 New WebSocket connection');

    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      console.log('❌ No token provided');
      ws.close(1008, 'No token provided');
      return;
    }

    try {
      const user = await this.verifyToken(token);
      
      if (!user) {
        ws.close(1008, 'Invalid token');
        return;
      }

      const client: Client = {
        ws,
        userId: user.id,
        user,
        boardId: null,
        cursorColor: user.cursorColor || '#FF6B6B'
      };

      this.clients.set(user.id, client);
      console.log(`✅ User ${user.username} connected`);

      this.send(ws, {
        type: 'CONNECTED',
        payload: {
          userId: user.id,
          username: user.username,
          cursorColor: client.cursorColor
        },
        timestamp: Date.now()
      });

      ws.on('message', (data: Buffer) => {
        this.handleMessage(client, data);
      });

      ws.on('close', () => {
        this.handleDisconnect(client);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });

    } catch (error) {
      console.error('❌ Authentication error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  private async verifyToken(token: string): Promise<User | null> {
    try {
      // Simplified - dla POC: token = userId
      const user = await User.findByPk(token);
      return user;
    } catch {
      return null;
    }
  }

  private async handleMessage(client: Client, data: Buffer) {
    try {
      const message = JSON.parse(data.toString()) as Message;
      console.log(`📨 Message from ${client.user.username}:`, message.type);

      switch (message.type) {
        case 'BOARD_JOINED':
          await this.handleJoinBoard(client, message.payload.boardId);
          break;

        case 'BOARD_LEFT':
          await this.handleLeaveBoard(client);
          break;

        case 'CURSOR_MOVE':
          this.handleCursorMove(client, message.payload);
          break;

        case 'DRAW_START':
        case 'DRAW_MOVE':
        case 'DRAW_END':
          await this.handleDrawEvent(client, message);
          break;

        case 'ELEMENT_ADD':
          await this.handleElementAdd(client, message.payload);
          break;

        case 'ELEMENT_UPDATE':
          await this.handleElementUpdate(client, message.payload);
          break;

        case 'ELEMENT_DELETE':
          await this.handleElementDelete(client, message.payload);
          break;

        case 'TEXT_ADD':
          await this.handleTextAdd(client, message.payload);
          break;

        case 'TEXT_UPDATE':
          await this.handleTextUpdate(client, message.payload);
          break;

        case 'STICKY_ADD':
          await this.handleStickyAdd(client, message.payload);
          break;

        case 'STICKY_UPDATE':
          await this.handleStickyUpdate(client, message.payload);
          break;

        case 'CLEAR_BOARD':
          await this.handleClearBoard(client);
          break;

        case 'UNDO':
          await this.handleUndo(client);
          break;

        case 'REDO':
          await this.handleRedo(client);
          break;

        case 'EXPORT_PNG':
          await this.handleExportPNG(client, message.payload);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      this.send(client.ws, {
        type: 'ERROR',
        payload: { error: 'Failed to process message' },
        timestamp: Date.now()
      });
    }
  }

  public notifyUserAddedToBoard(userId: string, data: {
    boardId: string;
    role: string;
    addedBy: string;
  }) {
    const client = this.clients.get(userId);
    
    if (client && client.ws.readyState === WebSocket.OPEN) {
      console.log(`📢 Notifying user ${userId} about board addition`);
      
      this.send(client.ws, {
        type: 'BOARD_MEMBER_ADDED',
        payload: {
          boardId: data.boardId,
          role: data.role,
          addedBy: data.addedBy,
          message: 'You have been added to a board'
        },
        timestamp: Date.now()
      });
    }
  }
  /**
   * Notify a user they were removed from a board
   */
  public notifyUserRemovedFromBoard(userId: string, data: {
    boardId: string;
    removedBy: string;
  }) {
    const client = this.clients.get(userId);
    
    if (client && client.ws.readyState === WebSocket.OPEN) {
      console.log(`📢 Notifying user ${userId} about board removal`);
      
      this.send(client.ws, {
        type: 'BOARD_MEMBER_REMOVED',
        payload: {
          boardId: data.boardId,
          removedBy: data.removedBy,
          message: 'You have been removed from a board'
        },
        timestamp: Date.now()
      });

      // If on this board now, kick them out
      if (client.boardId === data.boardId) {
        console.log(`🚪 Kicking user ${userId} from board ${data.boardId}`);
        
        this.send(client.ws, {
          type: 'BOARD_ACCESS_REVOKED',
          payload: {
            boardId: data.boardId,
            reason: 'You have been removed from this board'
          },
          timestamp: Date.now()
        });

        this.handleLeaveBoard(client);
      }
    }
  }

  /**
   * Check if user has access to board (called when joining)
   */
  private async checkBoardAccess(userId: string, boardId: string): Promise<boolean> {
    try {
      const membership = await BoardMember.findOne({
        where: { boardId, userId }
      });
      
      return membership !== null;
    } catch (error) {
      console.error('Error checking board access:', error);
      return false;
    }
  }

  
private async handleJoinBoard(client: Client, boardId: string) {
  console.log(`📋 ${client.user.username} joining board ${boardId}`);

  try {
    // Check access
    const hasAccess = await this.checkBoardAccess(client.userId, boardId);
    
    if (!hasAccess) {
      console.log(`❌ ${client.user.username} has no access to board ${boardId}`);
      this.send(client.ws, {
        type: 'ERROR',
        payload: { 
          error: 'Access denied to board',
          code: 'NO_ACCESS'
        },
        timestamp: Date.now()
      });
      return;
    }

    // Get membership for role
    const membership = await BoardMember.findOne({
      where: { boardId, userId: client.userId }
    });

    if (client.boardId) {
      await this.handleLeaveBoard(client);
    }

    client.boardId = boardId;

    if (!this.boardClients.has(boardId)) {
      this.boardClients.set(boardId, new Set());
    }
    this.boardClients.get(boardId)!.add(client.userId);

    if (!this.boardHistory.has(boardId)) {
      this.boardHistory.set(boardId, []);
    }

    const board = await Board.findByPk(boardId);
    if (!board) {
      this.send(client.ws, {
        type: 'ERROR',
        payload: { error: 'Board not found' },
        timestamp: Date.now()
      });
      return;
    }

    // ✅ Get current board members BEFORE sending BOARD_STATE
    const currentMembers = await this.getBoardMembers(boardId);
    
    // Send board state with current members
    this.send(client.ws, {
      type: 'BOARD_STATE',
      payload: {
        boardId,
        name: board.name,
        elements: board.elements,
        members: currentMembers,  // ✅ Include all current members
        role: membership?.role || 'viewer'
      },
      timestamp: Date.now()
    });

    // ✅ CRITICAL: Broadcast USER_JOINED with ALL required fields
    this.broadcastToBoard(boardId, {
      type: 'USER_JOINED',
      payload: {
        userId: client.userId,  // ✅ CRITICAL!
        username: client.user.username,
        displayName: client.user.displayName,
        cursorColor: client.cursorColor,
        role: membership?.role || 'viewer'  // ✅ Include role
      },
      timestamp: Date.now()
    }, client.userId);  // Exclude sender

    console.log(`✅ ${client.user.username} joined board ${boardId} as ${membership?.role}`);
    console.log(`👥 Board now has ${this.boardClients.get(boardId)!.size} users`);

  } catch (error) {
    console.error('Error joining board:', error);
    this.send(client.ws, {
      type: 'ERROR',
      payload: { error: 'Failed to join board' },
      timestamp: Date.now()
    });
  }
}

  private async handleLeaveBoard(client: Client) {
  if (!client.boardId) return;

  const boardId = client.boardId;
  console.log(`👋 ${client.user.username} leaving board ${boardId}`);

  // Remove from board clients
  const boardClientsSet = this.boardClients.get(boardId);
  if (boardClientsSet) {
    boardClientsSet.delete(client.userId);
    
    if (boardClientsSet.size === 0) {
      this.boardClients.delete(boardId);
      this.boardHistory.delete(boardId);
      console.log(`📋 Board ${boardId} now empty, cleaned up`);
    } else {
      console.log(`👥 Board ${boardId} now has ${boardClientsSet.size} users`);
    }
  }

  // ✅ CRITICAL: Broadcast USER_LEFT with userId
  this.broadcastToBoard(boardId, {
    type: 'USER_LEFT',
    payload: {
      userId: client.userId,  // ✅ CRITICAL!
      username: client.user.username,
      displayName: client.user.displayName
    },
    timestamp: Date.now()
  });

  client.boardId = null;
}

  private handleCursorMove(client: Client, payload: any) {
    if (!client.boardId) return;

    const cursorPosition: CursorPosition = {
      userId: client.userId,
      username: client.user.username,
      displayName: client.user.displayName,
      color: client.cursorColor,
      x: payload.x,
      y: payload.y,
      tool: payload.tool,
      timestamp: Date.now()
    };

    this.broadcastToBoard(client.boardId, {
      type: 'CURSOR_MOVE',
      payload: cursorPosition,
      timestamp: Date.now()
    }, client.userId);
  }

  private async handleDrawEvent(client: Client, message: Message) {
    if (!client.boardId) return;

    // Broadcast immediately
    this.broadcastToBoard(client.boardId, message, client.userId);

    // Save on DRAW_END
    if (message.type === 'DRAW_END' && message.payload.element) {
      try {
        const board = await Board.findByPk(client.boardId);
        if (board) {
          const elements = [...board.elements, message.payload.element];
          
          // Save to history for undo
          this.saveToHistory(client.boardId, elements);
          
          await board.update({ elements });
        }
      } catch (error) {
        console.error('Error saving draw event:', error);
      }
    }
  }

  private async handleElementAdd(client: Client, element: CanvasElement) {
    if (!client.boardId) return;

    try {
      const board = await Board.findByPk(client.boardId);
      if (board) {
        const elements = [...board.elements, element];
        
        this.saveToHistory(client.boardId, elements);
        await board.update({ elements });

        this.broadcastToBoard(client.boardId, {
          type: 'ELEMENT_ADD',
          payload: element,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error adding element:', error);
    }
  }

  private async handleElementUpdate(client: Client, payload: { elementId: string; changes: Partial<CanvasElement> }) {
    if (!client.boardId) return;

    try {
      const board = await Board.findByPk(client.boardId);
      if (board) {
        const elements = board.elements.map(el => {
          const elId = this.getElementId(el);
          if (elId === payload.elementId) {
            return { ...el, ...payload.changes };
          }
          return el;
        });

        this.saveToHistory(client.boardId, elements);
        await board.update({ elements });

        this.broadcastToBoard(client.boardId, {
          type: 'ELEMENT_UPDATE',
          payload: { elementId: payload.elementId, changes: payload.changes },
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error updating element:', error);
    }
  }

  private async handleElementDelete(client: Client, payload: { elementId: string }) {
    if (!client.boardId) return;

    try {
      const board = await Board.findByPk(client.boardId);
      if (board) {
        const elements = board.elements.filter(el => this.getElementId(el) !== payload.elementId);

        this.saveToHistory(client.boardId, elements);
        await board.update({ elements });

        this.broadcastToBoard(client.boardId, {
          type: 'ELEMENT_DELETE',
          payload: { elementId: payload.elementId },
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error deleting element:', error);
    }
  }

  private async handleTextAdd(client: Client, textElement: TextElement & { userId: string; timestamp: number }) {
    if (!client.boardId) return;

    try {
      const board = await Board.findByPk(client.boardId);
      if (board) {
        const element: CanvasElement = {
          type: 'text',
          data: textElement
        };

        const elements = [...board.elements, element];
        this.saveToHistory(client.boardId, elements);
        await board.update({ elements });

        this.broadcastToBoard(client.boardId, {
          type: 'TEXT_ADD',
          payload: element,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error adding text:', error);
    }
  }

  private async handleTextUpdate(client: Client, payload: { elementId: string; text: string }) {
    if (!client.boardId) return;

    try {
      const board = await Board.findByPk(client.boardId);
      if (board) {
        const elements = board.elements.map(el => {
          if (el.type === 'text' && el.data.id === payload.elementId) {
            return {
              ...el,
              data: { ...el.data, text: payload.text }
            };
          }
          return el;
        });

        this.saveToHistory(client.boardId, elements);
        await board.update({ elements });

        this.broadcastToBoard(client.boardId, {
          type: 'TEXT_UPDATE',
          payload,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error updating text:', error);
    }
  }

  private async handleStickyAdd(client: Client, stickyNote: StickyNote & { userId: string; timestamp: number }) {
    if (!client.boardId) return;

    try {
      const board = await Board.findByPk(client.boardId);
      if (board) {
        const element: CanvasElement = {
          type: 'sticky',
          data: stickyNote
        };

        const elements = [...board.elements, element];
        this.saveToHistory(client.boardId, elements);
        await board.update({ elements });

        this.broadcastToBoard(client.boardId, {
          type: 'STICKY_ADD',
          payload: element,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error adding sticky:', error);
    }
  }

  private async handleStickyUpdate(client: Client, payload: { elementId: string; text?: string; x?: number; y?: number }) {
    if (!client.boardId) return;

    try {
      const board = await Board.findByPk(client.boardId);
      if (board) {
        const elements = board.elements.map(el => {
          if (el.type === 'sticky' && el.data.id === payload.elementId) {
            return {
              ...el,
              data: { 
                ...el.data, 
                ...(payload.text !== undefined && { text: payload.text }),
                ...(payload.x !== undefined && { x: payload.x }),
                ...(payload.y !== undefined && { y: payload.y })
              }
            };
          }
          return el;
        });

        this.saveToHistory(client.boardId, elements);
        await board.update({ elements });

        this.broadcastToBoard(client.boardId, {
          type: 'STICKY_UPDATE',
          payload,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error updating sticky:', error);
    }
  }

  private async handleClearBoard(client: Client) {
    if (!client.boardId) return;

    try {
      const board = await Board.findByPk(client.boardId);
      if (board) {
        this.saveToHistory(client.boardId, []);
        await board.update({ elements: [] });

        this.broadcastToBoard(client.boardId, {
          type: 'CLEAR_BOARD',
          payload: {},
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error clearing board:', error);
    }
  }

  private async handleUndo(client: Client) {
    if (!client.boardId) return;

    try {
      const history = this.boardHistory.get(client.boardId);
      if (!history || history.length <= 1) {
        return; // Nothing to undo
      }

      // Remove current state
      history.pop();
      
      // Get previous state
      const previousState = history[history.length - 1] || [];

      const board = await Board.findByPk(client.boardId);
      if (board) {
        await board.update({ elements: previousState });

        this.broadcastToBoard(client.boardId, {
          type: 'BOARD_STATE',
          payload: {
            boardId: client.boardId,
            name: board.name,
            elements: previousState,
            members: await this.getBoardMembers(client.boardId)
          },
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error undoing:', error);
    }
  }

  private async handleRedo(client: Client) {
    // TODO: Implement redo (requires separate redo stack)
    console.log('Redo not yet implemented');
  }

  private async handleExportPNG(client: Client, payload: { dataURL: string }) {
    // Server just saves the thumbnail
    if (!client.boardId) return;

    try {
      const board = await Board.findByPk(client.boardId);
      if (board) {
        await board.update({ thumbnail: payload.dataURL });
        
        this.send(client.ws, {
          type: 'EXPORT_SUCCESS',
          payload: { message: 'Board exported successfully' },
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error exporting PNG:', error);
    }
  }

  private handleDisconnect(client: Client) {
    console.log(`🔌 User ${client.user.username} disconnected`);

    if (client.boardId) {
      this.handleLeaveBoard(client);
    }

    this.clients.delete(client.userId);
  }

  private async getBoardMembers(boardId: string): Promise<any[]> {
  try {
    const clientsOnBoard = this.boardClients.get(boardId);
    if (!clientsOnBoard || clientsOnBoard.size === 0) {
      console.log(`⚠️ No clients on board ${boardId}`);
      return [];
    }

    const members: any[] = [];

    for (const userId of clientsOnBoard) {
      const client = this.clients.get(userId);
      if (client) {
        // Get role from database
        const membership = await BoardMember.findOne({
          where: { boardId, userId }
        });

        members.push({
          userId: client.userId,
          username: client.user.username,
          displayName: client.user.displayName,
          cursorColor: client.cursorColor,
          role: membership?.role || 'viewer'
        });
      }
    }

    console.log(`👥 getBoardMembers: ${members.length} members on board ${boardId}`);
    return members;
  } catch (error) {
    console.error('Error getting board members:', error);
    return [];
  }
}

  private getElementId(element: CanvasElement): string {
    return element.data.id;
  }

  private saveToHistory(boardId: string, elements: CanvasElement[]) {
    if (!this.boardHistory.has(boardId)) {
      this.boardHistory.set(boardId, []);
    }

    const history = this.boardHistory.get(boardId)!;
    
    // Limit history to 50 states
    if (history.length >= 50) {
      history.shift();
    }

    history.push(JSON.parse(JSON.stringify(elements)));
  }

  private broadcastToBoard(boardId: string, message: Message, excludeUserId?: string) {
    const clients = this.boardClients.get(boardId);
    if (!clients) return;

    clients.forEach(userId => {
      if (userId !== excludeUserId) {
        const client = this.clients.get(userId);
        if (client) {
          this.send(client.ws, message);
        }
      }
    });
  }

  private send(ws: WebSocket, message: Message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public getOnlineUsers(): number {
    return this.clients.size;
  }

  public getBoardUserCount(boardId: string): number {
    return this.boardClients.get(boardId)?.size || 0;
  }
}
