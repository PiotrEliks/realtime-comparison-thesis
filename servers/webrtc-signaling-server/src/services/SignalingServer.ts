// servers/webrtc-server/src/services/SignalingServer.ts

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { User } from '@realtime-thesis/shared-server/models/chat';

interface Client {
  ws: WebSocket;
  userId: string;
  user: User;
  rooms: Set<string>;
  peerId?: string;
}

interface SignalingMessage {
  type: 'join-room' | 'leave-room' | 'offer' | 'answer' | 'ice-candidate' | 'message' | 'typing' | 'stop-typing';
  roomId?: string;
  peerId?: string;
  targetPeerId?: string;
  data?: any;
}

export class SignalingServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private peerConnections: Map<string, string> = new Map();
  private roomMembers: Map<string, Set<string>> = new Map();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    console.log(`📡 WebRTC Signaling Server started on port ${port}`);

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
      const { AuthService } = await import('@realtime-thesis/shared-server/services/AuthService');
      const authService = new AuthService();
      const user = await authService.getUserFromToken(token);

      if (!user) {
        ws.close(1008, 'Invalid token');
        return;
      }

      const peerId = `peer-${user.id}-${Date.now()}`;

      const client: Client = {
        ws,
        userId: user.id,
        user,
        rooms: new Set(),
        peerId
      };

      this.clients.set(user.id, client);
      this.peerConnections.set(peerId, user.id);

      console.log(`✅ User ${user.username} connected (peerId: ${peerId})`);

      this.send(ws, {
        type: 'connected',
        peerId,
        userId: user.id
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

  private handleMessage(client: Client, data: Buffer) {
    try {
      const message: SignalingMessage = JSON.parse(data.toString());
      console.log(`📨 Message from ${client.user.username}:`, message.type);

      switch (message.type) {
        case 'join-room':
          this.handleJoinRoom(client, message.roomId!);
          break;

        case 'leave-room':
          this.handleLeaveRoom(client, message.roomId!);
          break;

        case 'offer':
          this.handleOffer(client, message);
          break;

        case 'answer':
          this.handleAnswer(client, message);
          break;

        case 'ice-candidate':
          this.handleIceCandidate(client, message);
          break;

        case 'message':
          this.handleChatMessage(client, message);
          break;

        case 'typing':
          this.handleTyping(client, message.roomId!, true);
          break;

        case 'stop-typing':
          this.handleTyping(client, message.roomId!, false);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
    }
  }

  private handleJoinRoom(client: Client, roomId: string) {
    console.log(`➕ ${client.user.username} joining room ${roomId}`);

    client.rooms.add(roomId);

    if (!this.roomMembers.has(roomId)) {
      this.roomMembers.set(roomId, new Set());
    }
    this.roomMembers.get(roomId)!.add(client.userId);

    const existingPeers = Array.from(this.roomMembers.get(roomId)!)
      .filter(userId => userId !== client.userId)
      .map(userId => {
        const peer = this.clients.get(userId);
        return peer ? {
          peerId: peer.peerId,
          userId: peer.userId,
          username: peer.user.username,
          displayName: peer.user.displayName
        } : null;
      })
      .filter(Boolean);

    this.send(client.ws, {
      type: 'room-joined',
      roomId,
      peers: existingPeers
    });

    this.broadcastToRoom(roomId, {
      type: 'peer-joined',
      roomId,
      peer: {
        peerId: client.peerId,
        userId: client.userId,
        username: client.user.username,
        displayName: client.user.displayName
      }
    }, client.userId);

    console.log(`✅ ${client.user.username} joined room ${roomId}. Total peers: ${existingPeers.length + 1}`);
  }

  private handleLeaveRoom(client: Client, roomId: string) {
    console.log(`➖ ${client.user.username} leaving room ${roomId}`);

    client.rooms.delete(roomId);
    this.roomMembers.get(roomId)?.delete(client.userId);

    this.broadcastToRoom(roomId, {
      type: 'peer-left',
      roomId,
      peerId: client.peerId,
      userId: client.userId
    }, client.userId);
  }

  private handleOffer(client: Client, message: SignalingMessage) {
    const targetUserId = this.peerConnections.get(message.targetPeerId!);
    if (!targetUserId) {
      console.log(`❌ Target peer not found: ${message.targetPeerId}`);
      return;
    }

    const targetClient = this.clients.get(targetUserId);
    if (!targetClient) {
      console.log(`❌ Target client not found: ${targetUserId}`);
      return;
    }

    console.log(`📤 Forwarding offer from ${client.peerId} to ${targetClient.peerId}`);

    this.send(targetClient.ws, {
      type: 'offer',
      fromPeerId: client.peerId,
      offer: message.data
    });
  }

  private handleAnswer(client: Client, message: SignalingMessage) {
    const targetUserId = this.peerConnections.get(message.targetPeerId!);
    if (!targetUserId) return;

    const targetClient = this.clients.get(targetUserId);
    if (!targetClient) return;

    console.log(`📤 Forwarding answer from ${client.peerId} to ${targetClient.peerId}`);

    this.send(targetClient.ws, {
      type: 'answer',
      fromPeerId: client.peerId,
      answer: message.data
    });
  }

  private handleIceCandidate(client: Client, message: SignalingMessage) {
    const targetUserId = this.peerConnections.get(message.targetPeerId!);
    if (!targetUserId) return;

    const targetClient = this.clients.get(targetUserId);
    if (!targetClient) return;

    this.send(targetClient.ws, {
      type: 'ice-candidate',
      fromPeerId: client.peerId,
      candidate: message.data
    });
  }

  private handleChatMessage(client: Client, message: SignalingMessage) {
    if (!message.roomId) return;

    this.broadcastToRoom(message.roomId, {
      type: 'message',
      roomId: message.roomId,
      fromPeerId: client.peerId,
      userId: client.userId,
      username: client.user.username,
      displayName: client.user.displayName,
      data: message.data
    }, client.userId);
  }

  private handleTyping(client: Client, roomId: string, isTyping: boolean) {
    this.broadcastToRoom(roomId, {
      type: isTyping ? 'user-typing' : 'user-stopped-typing',
      roomId,
      userId: client.userId,
      username: client.user.username,
      displayName: client.user.displayName
    }, client.userId);
  }

  private handleDisconnect(client: Client) {
    console.log(`🔌 User ${client.user.username} disconnected`);

    client.rooms.forEach(roomId => {
      this.roomMembers.get(roomId)?.delete(client.userId);
      
      this.broadcastToRoom(roomId, {
        type: 'peer-left',
        roomId,
        peerId: client.peerId,
        userId: client.userId
      });
    });

    this.clients.delete(client.userId);
    if (client.peerId) {
      this.peerConnections.delete(client.peerId);
    }
  }

  // ===== PUBLIC METHODS FOR BROADCASTING FROM REST API =====

  /**
   * Broadcast message to all users in room (called from REST API after DB save)
   */
  public broadcastMessage(roomId: string, message: any) {
    console.log(`📢 Broadcasting message to room ${roomId}`);
    this.broadcastToRoom(roomId, {
      type: 'NEW_MESSAGE',
      payload: message
    });
  }

  /**
   * Broadcast reaction update (called from REST API)
   */
  public broadcastReaction(roomId: string, messageId: string, reactions: any[]) {
    console.log(`📢 Broadcasting reaction update for message ${messageId}`);
    this.broadcastToRoom(roomId, {
      type: 'REACTION_UPDATED',
      payload: { messageId, reactions }
    });
  }

  /**
   * Broadcast message edit (called from REST API)
   */
  public broadcastMessageEdit(roomId: string, messageId: string, content: string, editedAt: Date) {
    console.log(`📢 Broadcasting message edit ${messageId}`);
    this.broadcastToRoom(roomId, {
      type: 'MESSAGE_EDITED',
      payload: { messageId, content, editedAt }
    });
  }

  /**
   * Broadcast message delete (called from REST API)
   */
  public broadcastMessageDelete(roomId: string, messageId: string) {
    console.log(`📢 Broadcasting message delete ${messageId}`);
    this.broadcastToRoom(roomId, {
      type: 'MESSAGE_DELETED',
      payload: { messageId }
    });
  }

  /**
   * Broadcast group name update
   */
  public broadcastGroupNameUpdate(roomId: string, name: string) {
    console.log(`📢 Broadcasting group name update ${roomId}`);
    this.broadcastToRoom(roomId, {
      type: 'GROUP_NAME_UPDATED',
      payload: { roomId, name }
    });
  }

  /**
   * Broadcast member added
   */
  public broadcastMemberAdded(roomId: string, member: any) {
    console.log(`📢 Broadcasting member added to ${roomId}`);
    this.broadcastToRoom(roomId, {
      type: 'MEMBER_ADDED',
      payload: { roomId, member }
    });
  }

  /**
   * Broadcast member removed
   */
  public broadcastMemberRemoved(roomId: string, userId: string) {
    console.log(`📢 Broadcasting member removed from ${roomId}`);
    this.broadcastToRoom(roomId, {
      type: 'MEMBER_REMOVED',
      payload: { roomId, userId }
    });
  }

  /**
   * Broadcast member promoted
   */
  public broadcastMemberPromoted(roomId: string, userId: string) {
    console.log(`📢 Broadcasting member promoted in ${roomId}`);
    this.broadcastToRoom(roomId, {
      type: 'MEMBER_PROMOTED',
      payload: { roomId, userId }
    });
  }

  // ===== PRIVATE HELPER =====

  private broadcastToRoom(roomId: string, message: any, excludeUserId?: string) {
    const members = this.roomMembers.get(roomId);
    if (!members) return;

    members.forEach(userId => {
      if (userId !== excludeUserId) {
        const client = this.clients.get(userId);
        if (client) {
          this.send(client.ws, message);
        }
      }
    });
  }

  private send(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public getOnlineUsers(): number {
    return this.clients.size;
  }

  public getRoomMembers(roomId: string): number {
    return this.roomMembers.get(roomId)?.size || 0;
  }
}
