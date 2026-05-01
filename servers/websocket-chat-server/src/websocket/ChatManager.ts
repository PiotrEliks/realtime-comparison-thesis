import { WebSocket } from 'ws';
import { AuthService } from '@realtime-thesis/shared-server/services/chat/AuthService';
import { RoomService } from '../services/RoomService.js';
import { MessageService } from '../services/MessageService.js';
import { ReactionService } from '../services/ReactionService.js';
import { User } from '@realtime-thesis/shared-server/models/chat';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  user: User;
  rooms: Set<string>;
}

export class ChatManager {
  private clients: Map<string, ConnectedClient> = new Map();
  private roomClients: Map<string, Set<string>> = new Map();
  private typingUsers: Map<string, Map<string, NodeJS.Timeout>> = new Map();

  private authService: AuthService;
  private roomService: RoomService;
  private messageService: MessageService;
  private reactionService: ReactionService;

  constructor() {
    this.authService = new AuthService();
    this.roomService = new RoomService();
    this.messageService = new MessageService();
    this.reactionService = new ReactionService();
  }
  

  async handleConnection(ws: WebSocket, token: string) {
    try {
      console.log('🔌 New connection attempt...');
      // Authenticate user
      const user = await this.authService.getUserFromToken(token);
      console.log('👤 User authenticated:', user?.username);
      
      if (!user) {
         console.log('❌ Authentication failed');
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Authentication failed' } }));
        ws.close();
        return;
      }

      const clientId = user.id;

      // Disconnect existing connection if any
      if (this.clients.has(clientId)) {
        const existingClient = this.clients.get(clientId);
        existingClient?.ws.close();
      }

      // Update user status
      await user.update({ status: 'online', lastSeen: new Date() });

      // Get user's rooms
      const userRooms = await this.roomService.getUserRooms(user.id);
      console.log('📂 User rooms loaded:', userRooms.length);
      const roomIds = new Set(userRooms.map(r => r.id));

      // Store client
      const client: ConnectedClient = {
        ws,
        userId: user.id,
        user,
        rooms: roomIds
      };
      this.clients.set(clientId, client);

      // Subscribe to rooms
      roomIds.forEach(roomId => {
        if (!this.roomClients.has(roomId)) {
          this.roomClients.set(roomId, new Set());
        }
        this.roomClients.get(roomId)!.add(clientId);
      });

      console.log(`✅ User ${user.username} connected. Total clients: ${this.clients.size}`);

      // Send initial data
      this.sendToClient(clientId, {
        type: 'CONNECTED',
        payload: {
          user: user.toJSON(),
          rooms: userRooms
        }
      });

      // Notify others in rooms about online status
      roomIds.forEach(roomId => {
        this.broadcastToRoom(roomId, {
          type: 'USER_STATUS_CHANGE',
          payload: {
            userId: user.id,
            status: 'online'
          }
        }, clientId);
      });

      // Setup message handler
      ws.on('message', (data) => this.handleMessage(clientId, data.toString()));
      
      // Setup disconnect handler
      ws.on('close', () => this.handleDisconnect(clientId));

      // Setup error handler
      ws.on('error', (error) => {
        console.error(`WebSocket error for user ${user.username}:`, error);
      });

      // Setup ping-pong
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

    } catch (error) {
      console.error('Connection error:', error);
      ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Connection failed' } }));
      ws.close();
    }
  }

  private async handleMessage(clientId: string, data: string) {
  try {
    const client = this.clients.get(clientId);
    if (!client) return;

    const message = JSON.parse(data);

    switch (message.type) {
      case 'SEND_MESSAGE':
        await this.handleSendMessage(client, message.payload);
        break;

      case 'EDIT_MESSAGE':    // NOWE
        await this.handleEditMessage(client, message.payload);
        break;

      case 'DELETE_MESSAGE':  // NOWE
        await this.handleDeleteMessage(client, message.payload);
        break;

      case 'MARK_AS_READ':    // NOWE
        await this.handleMarkAsRead(client, message.payload);
        break;

      case 'ADD_REACTION':      // NOWE
        await this.handleAddReaction(client, message.payload);
        break;

      case 'REMOVE_REACTION':   // NOWE
        await this.handleRemoveReaction(client, message.payload);
        break;

      case 'JOIN_ROOM':
        await this.handleJoinRoom(client, message.payload);
        break;

      case 'LEAVE_ROOM':
        await this.handleLeaveRoom(client, message.payload);
        break;

      case 'TYPING_START':
        this.handleTypingStart(client, message.payload);
        break;

      case 'TYPING_STOP':
        this.handleTypingStop(client, message.payload);
        break;

      case 'LOAD_MESSAGES':
        await this.handleLoadMessages(client, message.payload);
        break;

      case 'PING':
        this.sendToClient(clientId, {
          type: 'PONG',
          payload: { timestamp: message.payload?.timestamp || Date.now() }
        });
        break;

      case 'UPDATE_GROUP_NAME':
        await this.handleUpdateGroupName(client, message.payload);
        break;

      case 'REMOVE_MEMBER':
        await this.handleRemoveMember(client, message.payload);
        break;

      case 'ADD_MEMBER':
        await this.handleAddMember(client, message.payload);
        break;

      case 'PROMOTE_TO_ADMIN':
        await this.handlePromoteToAdmin(client, message.payload);
        break;

      case 'LEAVE_GROUP':
        await this.handleLeaveGroup(client, message.payload);
        break;

      case 'LOAD_MORE_MESSAGES':
        await this.handleLoadMoreMessages(client, message.payload);
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

private async handleEditMessage(client: ConnectedClient, payload: any) {
  try {
    const { messageId, content } = payload;

    const message = await this.messageService.updateMessage(
      messageId,
      client.userId,
      content
    );

    if (!message) return;

    // Broadcast do pokoju
    this.broadcastToRoom(message.roomId, {
      type: 'MESSAGE_EDITED',
      payload: {
        messageId,
        content,
        isEdited: true,
        editedAt: message.editedAt
      }
    });

  } catch (error: any) {
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}

private async handleDeleteMessage(client: ConnectedClient, payload: any) {
  try {
    const { messageId } = payload;

    const message = await this.messageService.deleteMessage(
      messageId,
      client.userId
    );

    if (!message) return;

    // Broadcast do pokoju
    this.broadcastToRoom(message.roomId, {
      type: 'MESSAGE_DELETED',
      payload: {
        messageId,
        isDeleted: true
      }
    });

  } catch (error: any) {
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}

private async handleMarkAsRead(client: ConnectedClient, payload: any) {
  try {
    const { messageIds } = payload;

    if (!Array.isArray(messageIds)) return;

    for (const messageId of messageIds) {
      const receipt = await this.messageService.markAsRead(messageId, client.userId);
      
      if (receipt) {
        // Znajdź autora wiadomości i wyślij mu potwierdzenie
        const message = await this.messageService.getMessageWithDetails(messageId);
        if (message) {
          this.sendToClient(message.author.id, {
            type: 'MESSAGE_READ',
            payload: {
              messageId,
              userId: client.userId,
              userName: client.user.displayName || client.user.username,
              readAt: receipt.readAt
            }
          });
        }
      }
    }

  } catch (error) {
    console.error('Error marking messages as read:', error);
  }
}

// Zaktualizuj handleLeaveRoom:
private async handleLeaveRoom(client: ConnectedClient, payload: any) {
  try {
    const { roomId } = payload;

    client.rooms.delete(roomId);
    this.roomClients.get(roomId)?.delete(client.userId);

    // NOWE: Wyślij informację o opuszczeniu pokoju z nazwą użytkownika
    this.broadcastToRoom(roomId, {
      type: 'USER_LEFT_ROOM',
      payload: {
        roomId,
        userId: client.userId,
        userName: client.user.displayName || client.user.username
      }
    });
    
    // Wyczyść typing indicator przy opuszczeniu
    this.handleTypingStop(client, { roomId });

  } catch (error) {
    console.error('Error leaving room:', error);
  }
}

private async handleAddReaction(client: ConnectedClient, payload: any) {
  try {
    const { messageId, emoji } = payload;

    // Dodaj reakcję w bazie danych
    const reaction = await this.reactionService.addReaction(
      messageId,
      client.userId,
      emoji
    );

    if (!reaction) return;

    // Pobierz wiadomość aby znaleźć roomId
    const message = await this.messageService.getMessageWithDetails(messageId);
    if (!message) return;

    // Pobierz wszystkie reakcje dla tej wiadomości
    const reactions = await this.reactionService.getMessageReactions(messageId);

    // Broadcast do pokoju
    this.broadcastToRoom(message.roomId, {
      type: 'REACTION_ADDED',
      payload: {
        messageId,
        userId: client.userId,
        emoji,
        reactions // Wysyłamy wszystkie reakcje
      }
    });

  } catch (error: any) {
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}

private async handleRemoveReaction(client: ConnectedClient, payload: any) {
  try {
    const { messageId, emoji } = payload;

    await this.reactionService.removeReaction(
      messageId,
      client.userId,
      emoji
    );

    // Pobierz wiadomość aby znaleźć roomId
    const message = await this.messageService.getMessageWithDetails(messageId);
    if (!message) return;

    // Pobierz zaktualizowane reakcje
    const reactions = await this.reactionService.getMessageReactions(messageId);

    // Broadcast do pokoju
    this.broadcastToRoom(message.roomId, {
      type: 'REACTION_REMOVED',
      payload: {
        messageId,
        userId: client.userId,
        emoji,
        reactions
      }
    });

  } catch (error: any) {
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}

  private async handleSendMessage(client: ConnectedClient, payload: any) {
  try {
    const { roomId, content, tempId, replyToId } = payload;

    if (!roomId || !content) {
      throw new Error('Missing required fields');
    }

    if (!client.rooms.has(roomId)) {
      throw new Error('Not a member of this room');
    }

    const isImage = content.startsWith('[IMAGE]');
    const messageType: 'text' | 'file' = isImage ? 'file' : 'text';  // ← ZMIANA

    const message = await this.messageService.createMessage({
      roomId: roomId,
      userId: client.userId,
      content: content,
      type: messageType,  // ← Teraz pasuje do typu
      replyToId: replyToId || undefined
    });

    const fullMessage = await this.messageService.getMessageWithDetails(message.id);

    this.broadcastToRoom(roomId, {
      type: 'NEW_MESSAGE',
      payload: fullMessage
    });

    this.handleTypingStop(client, { roomId });

  } catch (error: any) {
    console.error('Error sending message:', error);
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}
  private async handleJoinRoom(client: ConnectedClient, payload: any) {
    try {
      const { roomId } = payload;

      // Add to room
      client.rooms.add(roomId);
      
      if (!this.roomClients.has(roomId)) {
        this.roomClients.set(roomId, new Set());
      }
      this.roomClients.get(roomId)!.add(client.userId);

      // Load room details
      const room = await this.roomService.getRoomById(roomId);
      const messages = await this.messageService.getRoomMessages(roomId, 50);

      // Send room data to client
      this.sendToClient(client.userId, {
        type: 'ROOM_JOINED',
        payload: {
          room,
          messages
        }
      });

      // Notify others
      this.broadcastToRoom(roomId, {
        type: 'USER_JOINED_ROOM',
        payload: {
          roomId,
          user: client.user.toJSON()
        }
      }, client.userId);

    } catch (error) {
      console.error('Error joining room:', error);
    }
  }

  private handleTypingStart(client: ConnectedClient, payload: any) {
    const { roomId } = payload;

    if (!client.rooms.has(roomId)) return;

    // Clear existing timeout
    const roomTyping = this.typingUsers.get(roomId) || new Map();
    const existingTimeout = roomTyping.get(client.userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout (3 seconds)
    const timeout = setTimeout(() => {
      this.handleTypingStop(client, { roomId });
    }, 3000);

    roomTyping.set(client.userId, timeout);
    this.typingUsers.set(roomId, roomTyping);

    // Broadcast to room
    this.broadcastToRoom(roomId, {
      type: 'USER_TYPING',
      payload: {
        roomId,
        userId: client.userId,
        username: client.user.username,
        displayName: client.user.displayName
      }
    }, client.userId);
  }

  private handleTypingStop(client: ConnectedClient, payload: any) {
    const { roomId } = payload;

    const roomTyping = this.typingUsers.get(roomId);
    if (roomTyping) {
      const timeout = roomTyping.get(client.userId);
      if (timeout) {
        clearTimeout(timeout);
        roomTyping.delete(client.userId);
      }
    }

    this.broadcastToRoom(roomId, {
      type: 'USER_STOPPED_TYPING',
      payload: {
        roomId,
        userId: client.userId
      }
    }, client.userId);
  }

  private async handleLoadMessages(client: ConnectedClient, payload: any) {
    try {
      const { roomId, before, limit } = payload;

      if (!client.rooms.has(roomId)) return;

      const messages = await this.messageService.getRoomMessages(
        roomId,
        limit || 50,
        before ? new Date(before) : undefined
      );

      this.sendToClient(client.userId, {
        type: 'MESSAGES_LOADED',
        payload: {
          roomId,
          messages
        }
      });

    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  private async handleUpdateGroupName(client: ConnectedClient, payload: any) {
  try {
    const { roomId, name } = payload;

    const room = await this.roomService.updateGroupName(roomId, client.userId, name);

    // Broadcast do wszystkich w pokoju
    this.broadcastToRoom(roomId, {
      type: 'GROUP_NAME_UPDATED',
      payload: {
        roomId,
        name,
        updatedBy: client.user.displayName || client.user.username
      }
    });

  } catch (error: any) {
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}

private async handleRemoveMember(client: ConnectedClient, payload: any) {
  try {
    const { roomId, userId } = payload;

    await this.roomService.removeMemberFromGroup(roomId, client.userId, userId);

    // Usuń usera z pokoju w pamięci
    this.roomClients.get(roomId)?.delete(userId);

    // Wyślij powiadomienie do usuniętego użytkownika
    this.sendToClient(userId, {
      type: 'REMOVED_FROM_GROUP',
      payload: {
        roomId,
        removedBy: client.user.displayName || client.user.username
      }
    });

    // Powiadom innych w pokoju
    this.broadcastToRoom(roomId, {
      type: 'MEMBER_REMOVED',
      payload: {
        roomId,
        userId,
        removedBy: client.user.displayName || client.user.username
      }
    });

  } catch (error: any) {
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}

private async handleAddMember(client: ConnectedClient, payload: any) {
  try {
    const { roomId, userId } = payload;

    // 1. Zapisujemy w bazie i ODBIERAMY odświeżony pokój (z include User)
    const updatedRoom = await this.roomService.addMemberToGroup(roomId, client.userId, userId);

    // 2. Szukamy w tym obiekcie danych nowego członka (żeby mieć jego displayName, avatar itd.)
    const newMemberData = updatedRoom?.members.find((m: any) => m.userId === userId);

    if (!newMemberData) {
      throw new Error('Failed to retrieve new member data');
    }

    // 3. Dodaj użytkownika do mapy połączeń w pamięci (zamiast usuwać!)
    if (!this.roomClients.has(roomId)) {
      this.roomClients.set(roomId, new Set());
    }
    this.roomClients.get(roomId)?.add(userId);

    // 4. Powiadom nowego użytkownika (wysyłamy mu cały pokój, żeby dodał go do listy)
    this.sendToClient(userId, {
      type: 'MEMBER_ADDED', // Możesz użyć osobnego typu, by frontend wiedział, że ma nowy pokój
      payload: updatedRoom
    });

    // 5. Powiadom WSZYSTKICH w pokoju o nowym członku
    // WAŻNE: Payload musi zawierać obiekt 'member', bo tego szuka Twój frontend w kodzie:
    // room.members: [...room.members, message.payload.member]
    this.broadcastToRoom(roomId, {
      type: 'MEMBER_ADDED',
      payload: {
        roomId,
        member: newMemberData, // To jest ten brakujący element!
        addedBy: client.user.displayName || client.user.username
      }
    });

  } catch (error: any) {
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}


private async handlePromoteToAdmin(client: ConnectedClient, payload: any) {
  try {
    const { roomId, userId } = payload;

    await this.roomService.promoteToAdmin(roomId, client.userId, userId);

    this.broadcastToRoom(roomId, {
      type: 'MEMBER_PROMOTED',
      payload: {
        roomId,
        userId,
        promotedBy: client.user.displayName || client.user.username
      }
    });

  } catch (error: any) {
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}

private async handleLeaveGroup(client: ConnectedClient, payload: any) {
  try {
    const { roomId } = payload;

    await this.roomService.leaveGroup(roomId, client.userId);

    // Usuń z pamięci
    client.rooms.delete(roomId);
    this.roomClients.get(roomId)?.delete(client.userId);

    // Powiadom innych
    this.broadcastToRoom(roomId, {
      type: 'MEMBER_LEFT',
      payload: {
        roomId,
        userId: client.userId,
        userName: client.user.displayName || client.user.username
      }
    });

    // Potwierdź opuszczenie
    this.sendToClient(client.userId, {
      type: 'LEFT_GROUP',
      payload: { roomId }
    });

  } catch (error: any) {
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: error.message }
    });
  }
}

private async handleLoadMoreMessages(client: ConnectedClient, payload: any) {
  try {
    const { roomId, before, limit = 50 } = payload;

    if (!client.rooms.has(roomId)) {
      this.sendToClient(client.userId, {
        type: 'ERROR',
        payload: { message: 'Not a member of this room' }
      });
      return;
    }

    const beforeDate = before ? new Date(before) : undefined;
    const messages = await this.messageService.getRoomMessages(roomId, limit, beforeDate);

    this.sendToClient(client.userId, {
      type: 'MESSAGES_LOADED',
      payload: {
        roomId,
        messages
      }
    });

  } catch (error) {
    console.error('Error loading more messages:', error);
    this.sendToClient(client.userId, {
      type: 'ERROR',
      payload: { message: 'Failed to load messages' }
    });
  }
}

  private async handleDisconnect(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Update user status
    await client.user.update({ status: 'offline', lastSeen: new Date() });

    // Remove from rooms
    client.rooms.forEach(roomId => {
      this.roomClients.get(roomId)?.delete(clientId);
      
      // Notify others
      this.broadcastToRoom(roomId, {
        type: 'USER_STATUS_CHANGE',
        payload: {
          userId: clientId,
          status: 'offline'
        }
      });
    });

    // Clear typing indicators
    this.typingUsers.forEach((roomTyping, roomId) => {
      if (roomTyping.has(clientId)) {
        clearTimeout(roomTyping.get(clientId));
        roomTyping.delete(clientId);
      }
    });

    this.clients.delete(clientId);
    console.log(`❌ User ${client.user.username} disconnected. Total clients: ${this.clients.size}`);
  }

  private sendToClient(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private broadcastToRoom(roomId: string, message: any, excludeClientId?: string) {
    const clients = this.roomClients.get(roomId);
    if (!clients) return;

    const messageStr = JSON.stringify(message);
    clients.forEach(clientId => {
      if (clientId !== excludeClientId) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(messageStr);
        }
      }
    });
  }

  getOnlineUsersInRoom(roomId: string): string[] {
    const clients = this.roomClients.get(roomId);
    if (!clients) return [];
    return Array.from(clients);
  }

  isUserOnline(userId: string): boolean {
    return this.clients.has(userId);
  }
}