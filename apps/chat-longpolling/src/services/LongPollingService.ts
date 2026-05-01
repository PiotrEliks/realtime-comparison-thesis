// clients/longpolling-chat/src/services/LongPollingService.ts

const API_URL = 'http://localhost:4003/api';

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

export class LongPollingService {
  private token: string;
  private lastEventId: number = 0;
  private isPolling: boolean = false;
  private pollingAbortController: AbortController | null = null;
  private statusChangeHandler: ((status: 'connecting' | 'connected' | 'disconnected' | 'error') => void) | null = null;
  private messageHandler: ((message: { type: string; payload: any }) => void) | null = null;
  private latencyStart: number = 0;
  private latency: number = 0;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Start continuous long polling
   */
  async connect(): Promise<void> {
    if (this.isPolling) return;

    console.log('🔄 Long Polling: Starting connection...');
    this.isPolling = true;
    this.lastEventId = 0;
    this.statusChangeHandler?.('connecting');

    // Start polling loop
    this.poll();
  }

  /**
   * Stop polling
   */
  disconnect(): void {
    console.log('🛑 Long Polling: Disconnecting...');
    this.isPolling = false;
    
    if (this.pollingAbortController) {
      this.pollingAbortController.abort();
      this.pollingAbortController = null;
    }

    this.statusChangeHandler?.('disconnected');
  }

  /**
   * Main polling loop
   */
  private async poll(): Promise<void> {
    while (this.isPolling) {
      try {
        this.pollingAbortController = new AbortController();
        this.latencyStart = Date.now();

        const response = await fetch(
          `${API_URL}/poll?token=${this.token}&lastEventId=${this.lastEventId}`,
          {
            signal: this.pollingAbortController.signal,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        this.latency = Date.now() - this.latencyStart;

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            console.error('❌ Long Polling: Authentication error');
            this.statusChangeHandler?.('error');
            this.isPolling = false;
            break;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // Update status to connected on first successful poll
        if (this.lastEventId === 0) {
          this.statusChangeHandler?.('connected');
        }

        // Process events
        if (data.events && data.events.length > 0) {
          console.log(`📥 Long Polling: Received ${data.events.length} events`);
          
          data.events.forEach((event: any) => {
            this.messageHandler?.({
              type: event.type,
              payload: event.payload
            });
          });

          // Update lastEventId
          this.lastEventId = data.lastEventId;
        }

        // Small delay before next poll (prevent aggressive polling)
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('⏹️  Long Polling: Request aborted');
          break;
        }

        console.error('❌ Long Polling error:', error);
        this.statusChangeHandler?.('error');

        // Retry after delay
        if (this.isPolling) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          this.statusChangeHandler?.('connecting');
        }
      }
    }

    console.log('🛑 Long Polling: Stopped');
  }

  /**
   * Register status change handler
   */
  onStatusChange(handler: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void): void {
    this.statusChangeHandler = handler;
  }

  /**
   * Register message handler
   */
  onMessage(handler: (message: { type: string; payload: any }) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Get current latency
   */
  getLatency(): number {
    return this.latency;
  }

  // --- API Methods (same as SSE) ---

  async joinRoom(roomId: string): Promise<void> {
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
  }

  async sendMessage(roomId: string, content: string, replyToId?: string): Promise<void> {
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
  }

  async editMessage(messageId: string, content: string): Promise<void> {
    const response = await fetch(`${API_URL}/messages/${messageId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });

    if (!response.ok) {
      throw new Error('Failed to edit message');
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    const response = await fetch(`${API_URL}/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to delete message');
    }
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

    if (!response.ok) {
      throw new Error('Failed to add reaction');
    }
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

    if (!response.ok) {
      throw new Error('Failed to remove reaction');
    }
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

    if (!response.ok) {
      throw new Error('Failed to create private room');
    }

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

    if (!response.ok) {
      throw new Error('Failed to create group room');
    }

    const data = await response.json();
    return data.room;
  }

  async loadMoreMessages(roomId: string, before: string, limit: number = 50): Promise<Message[]> {
    const response = await fetch(
      `${API_URL}/messages/room/${roomId}?before=${before}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to load messages');
    }

    const data = await response.json();
    return data.messages;
  }

  async markAsRead(messageId: string): Promise<void> {
    const response = await fetch(`${API_URL}/messages/${messageId}/read`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to mark as read');
    }
  }

  async startTyping(roomId: string): Promise<void> {
    await fetch(`${API_URL}/typing/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ roomId })
    });
  }

  async stopTyping(roomId: string): Promise<void> {
    await fetch(`${API_URL}/typing/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ roomId })
    });
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

    if (!response.ok) {
      throw new Error('Failed to update group name');
    }
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

    if (!response.ok) {
      throw new Error('Failed to add member');
    }
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/rooms/${roomId}/members/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to remove member');
    }
  }

  async promoteToAdmin(roomId: string, userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/rooms/${roomId}/members/${userId}/promote`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to promote to admin');
    }
  }

  async leaveGroup(roomId: string): Promise<void> {
    const response = await fetch(`${API_URL}/rooms/${roomId}/leave`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to leave group');
    }
  }
}
