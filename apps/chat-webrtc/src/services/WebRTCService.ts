// clients/webrtc-chat/src/services/WebRTCService.ts

const API_URL = 'http://localhost:4004/api';
const WS_URL = 'ws://localhost:4005';

// ICE servers (STUN dla NAT traversal)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  status?: 'online' | 'offline' | 'away';
  lastSeen?: Date;
}

export interface Room {
  id: string;
  name?: string;
  type: 'private' | 'group';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  members: RoomMember[];
  messages?: Message[];
}

export interface RoomMember {
  userId: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  user?: User;
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  type: 'text' | 'file';
  createdAt: Date;
  updatedAt?: Date;
  isEdited?: boolean;
  editedAt?: Date;
  isDeleted?: boolean;
  author?: User;
  replyTo?: Message;
  replyToId?: string;
  reactions?: Reaction[];
  receipts?: MessageReceipt[];
}

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
  user?: User;
}

export interface MessageReceipt {
  userId: string;
  userName: string;
  readAt: Date;
}

interface Peer {
  peerId: string;
  userId: string;
  username: string;
  displayName?: string;
  connection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
}

export class WebRTCService {
  private token: string;
  private ws: WebSocket | null = null;
  private myPeerId: string | null = null;
  private peers: Map<string, Peer> = new Map();
  private currentRoom: string | null = null;
  
  private statusChangeHandler: ((status: 'connecting' | 'connected' | 'disconnected' | 'error') => void) | null = null;
  private messageHandler: ((message: { type: string; payload: any }) => void) | null = null;
  private latencyStart: number = 0;
  private latency: number = 0;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Connect to signaling server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔄 WebRTC: Connecting to signaling server...');
      this.statusChangeHandler?.('connecting');

      this.ws = new WebSocket(`${WS_URL}?token=${this.token}`);

      this.ws.onopen = () => {
        console.log('✅ WebRTC: Connected to signaling server');
        this.statusChangeHandler?.('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebRTC: WebSocket error:', error);
        this.statusChangeHandler?.('error');
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('🔌 WebRTC: Disconnected');
        this.statusChangeHandler?.('disconnected');
        this.cleanup();
      };
    });
  }

  /**
   * Disconnect from signaling server
   */
  disconnect(): void {
    console.log('🛑 WebRTC: Disconnecting...');
    
    // Close all peer connections
    this.peers.forEach(peer => {
      peer.dataChannel?.close();
      peer.connection.close();
    });
    this.peers.clear();

    // Close WebSocket
    this.ws?.close();
    this.ws = null;

    this.statusChangeHandler?.('disconnected');
  }

  /**
   * Handle signaling messages
   */
  private async handleSignalingMessage(message: any) {
    console.log('📨 Signaling message:', message.type);

    switch (message.type) {
      case 'connected':
        this.myPeerId = message.peerId;
        console.log(`✅ My peer ID: ${this.myPeerId}`);
        
        // Send initial CONNECTED event to app
        this.messageHandler?.({
          type: 'CONNECTED',
          payload: {
            peerId: this.myPeerId,
            userId: message.userId
          }
        });
        break;

      case 'room-joined':
        console.log(`📥 Joined room, peers:`, message.peers);
        
        // Create peer connections to existing peers
        for (const peer of message.peers) {
          await this.createPeerConnection(peer, true); // initiator
        }
        break;

      case 'peer-joined':
        console.log(`👥 New peer joined:`, message.peer);
        // Will receive offer from them (we're not initiator)
        break;

      case 'offer':
        await this.handleOffer(message);
        break;

      case 'answer':
        await this.handleAnswer(message);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(message);
        break;

      case 'peer-left':
        this.handlePeerLeft(message.peerId);
        break;

      case 'user-typing':
      case 'user-stopped-typing':
        this.messageHandler?.(message);
        break;

      default:
        console.log('Unknown signaling message:', message.type);
    }
  }

  /**
   * Create peer connection
   */
  private async createPeerConnection(peerInfo: any, isInitiator: boolean): Promise<void> {
    const { peerId, userId, username, displayName } = peerInfo;
    
    console.log(`🔗 Creating peer connection to ${username} (${peerId}), initiator: ${isInitiator}`);

    const pc = new RTCPeerConnection(ICE_SERVERS);

    const peer: Peer = {
      peerId,
      userId,
      username,
      displayName,
      connection: pc
    };

    this.peers.set(peerId, peer);

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          targetPeerId: peerId,
          data: event.candidate
        });
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`🔌 Connection state with ${username}: ${pc.connectionState}`);
      
      if (pc.connectionState === 'connected') {
        console.log(`✅ P2P connection established with ${username}`);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log(`❌ Connection lost with ${username}`);
        this.peers.delete(peerId);
      }
    };

    // Data channel handling
    if (isInitiator) {
      // Create data channel
      const dataChannel = pc.createDataChannel('chat');
      peer.dataChannel = dataChannel;
      this.setupDataChannel(dataChannel, peer);

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.send({
        type: 'offer',
        targetPeerId: peerId,
        data: offer
      });
    } else {
      // Wait for data channel from initiator
      pc.ondatachannel = (event) => {
        peer.dataChannel = event.channel;
        this.setupDataChannel(event.channel, peer);
      };
    }
  }

  /**
   * Setup data channel
   */
  private setupDataChannel(dataChannel: RTCDataChannel, peer: Peer) {
    dataChannel.onopen = () => {
      console.log(`📡 Data channel open with ${peer.username}`);
    };

    dataChannel.onclose = () => {
      console.log(`📡 Data channel closed with ${peer.username}`);
    };

    dataChannel.onmessage = (event) => {
      this.handleP2PMessage(event.data, peer);
    };

    dataChannel.onerror = (error) => {
      console.error(`❌ Data channel error with ${peer.username}:`, error);
    };
  }

  /**
   * Handle P2P message from data channel
   */
  private handleP2PMessage(data: string, peer: Peer) {
    try {
      const message = JSON.parse(data);
      console.log(`📥 P2P message from ${peer.username}:`, message.type);

      // Forward to app
      this.messageHandler?.(message);
    } catch (error) {
      console.error('Error parsing P2P message:', error);
    }
  }

  /**
   * Handle WebRTC offer
   */
  private async handleOffer(message: any) {
    const { fromPeerId, offer } = message;
    
    // Find peer info (might not exist yet)
    let peer = this.peers.get(fromPeerId);
    if (!peer) {
      // Create placeholder peer (will be updated later)
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peer = {
        peerId: fromPeerId,
        userId: '',
        username: 'Unknown',
        connection: pc
      };
      this.peers.set(fromPeerId, peer);

      // Setup ICE and connection handlers
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.send({
            type: 'ice-candidate',
            targetPeerId: fromPeerId,
            data: event.candidate
          });
        }
      };

      pc.ondatachannel = (event) => {
        peer!.dataChannel = event.channel;
        this.setupDataChannel(event.channel, peer!);
      };

      pc.onconnectionstatechange = () => {
        console.log(`🔌 Connection state: ${pc.connectionState}`);
      };
    }

    await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);

    this.send({
      type: 'answer',
      targetPeerId: fromPeerId,
      data: answer
    });
  }

  /**
   * Handle WebRTC answer
   */
  private async handleAnswer(message: any) {
    const { fromPeerId, answer } = message;
    const peer = this.peers.get(fromPeerId);
    
    if (!peer) {
      console.error(`Peer not found: ${fromPeerId}`);
      return;
    }

    await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /**
   * Handle ICE candidate
   */
  private async handleIceCandidate(message: any) {
    const { fromPeerId, candidate } = message;
    const peer = this.peers.get(fromPeerId);
    
    if (!peer) {
      console.error(`Peer not found: ${fromPeerId}`);
      return;
    }

    await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /**
   * Handle peer left
   */
  private handlePeerLeft(peerId: string) {
    console.log(`👋 Peer left: ${peerId}`);
    
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.dataChannel?.close();
      peer.connection.close();
      this.peers.delete(peerId);
    }
  }

  /**
   * Send message via signaling
   */
  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Join room
   */
  async joinRoom(roomId: string): Promise<void> {
    this.currentRoom = roomId;
    this.send({ type: 'join-room', roomId });

    // Also fetch from REST API
    const response = await fetch(`${API_URL}/rooms/${roomId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to join room');
    }

    const data = await response.json();
    
    // Send ROOM_JOINED event
    this.messageHandler?.({
      type: 'ROOM_JOINED',
      payload: {
        room: data.room,
        messages: data.messages
      }
    });
  }

  /**
   * Send message (P2P or fallback to server)
   */
  async sendMessage(roomId: string, content: string, replyToId?: string): Promise<void> {
    const messageData = {
      type: 'NEW_MESSAGE',
      payload: {
        roomId,
        content,
        replyToId,
        timestamp: Date.now()
      }
    };

    // Try P2P first
    let sentP2P = false;
    this.peers.forEach(peer => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        peer.dataChannel.send(JSON.stringify(messageData));
        sentP2P = true;
      }
    });

    // Fallback to REST API (always save to DB)
    const response = await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ roomId, content, replyToId })
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    if (!sentP2P) {
      console.log('⚠️  Sent via server (no P2P connection)');
    }
  }

  // Register handlers
  onStatusChange(handler: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void): void {
    this.statusChangeHandler = handler;
  }

  onMessage(handler: (message: { type: string; payload: any }) => void): void {
    this.messageHandler = handler;
  }

  getLatency(): number {
    return this.latency;
  }

  // Cleanup
  private cleanup() {
    this.peers.forEach(peer => {
      peer.dataChannel?.close();
      peer.connection.close();
    });
    this.peers.clear();
    this.currentRoom = null;
  }

  // REST API methods (same as other implementations)
  async editMessage(messageId: string, content: string): Promise<void> {
    const response = await fetch(`${API_URL}/messages/${messageId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });
    if (!response.ok) throw new Error('Failed to edit message');
  }

  async deleteMessage(messageId: string): Promise<void> {
    const response = await fetch(`${API_URL}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) throw new Error('Failed to delete message');
  }

  async addReaction(messageId: string, emoji: string): Promise<void> {
    const response = await fetch(`${API_URL}/reactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messageId, emoji })
    });
    if (!response.ok) throw new Error('Failed to add reaction');
  }

  async removeReaction(messageId: string, emoji: string): Promise<void> {
    const response = await fetch(`${API_URL}/reactions`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messageId, emoji })
    });
    if (!response.ok) throw new Error('Failed to remove reaction');
  }

  async createPrivateRoom(targetUserId: string): Promise<Room> {
    const response = await fetch(`${API_URL}/rooms/private`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ targetUserId })
    });
    if (!response.ok) throw new Error('Failed to create private room');
    const data = await response.json();
    return data.room;
  }

  async createGroupRoom(name: string, memberIds: string[]): Promise<Room> {
    const response = await fetch(`${API_URL}/rooms/group`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, memberIds })
    });
    if (!response.ok) throw new Error('Failed to create group room');
    const data = await response.json();
    return data.room;
  }

  async loadMoreMessages(roomId: string, before: string, limit: number = 50): Promise<Message[]> {
    const response = await fetch(
      `${API_URL}/messages/room/${roomId}?before=${before}&limit=${limit}`,
      { headers: { 'Authorization': `Bearer ${this.token}` } }
    );
    if (!response.ok) throw new Error('Failed to load messages');
    const data = await response.json();
    return data.messages;
  }

  async markAsRead(messageId: string): Promise<void> {
    await fetch(`${API_URL}/messages/${messageId}/read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
  }

  async startTyping(roomId: string): Promise<void> {
    this.send({ type: 'typing', roomId });
  }

  async stopTyping(roomId: string): Promise<void> {
    this.send({ type: 'stop-typing', roomId });
  }

  async updateGroupName(roomId: string, name: string): Promise<void> {
    const response = await fetch(`${API_URL}/rooms/${roomId}/name`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });
    if (!response.ok) throw new Error('Failed to update group name');
  }

  async addMemberToRoom(roomId: string, userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/rooms/${roomId}/members`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error('Failed to add member');
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/rooms/${roomId}/members/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) throw new Error('Failed to remove member');
  }

  async promoteToAdmin(roomId: string, userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/rooms/${roomId}/members/${userId}/promote`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) throw new Error('Failed to promote to admin');
  }

  async leaveGroup(roomId: string): Promise<void> {
    this.send({ type: 'leave-room', roomId });
    
    const response = await fetch(`${API_URL}/rooms/${roomId}/leave`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) throw new Error('Failed to leave group');
  }
}
