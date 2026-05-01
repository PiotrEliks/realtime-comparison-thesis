// SSEService.ts - Zamiennik WebSocketService używający SSE + HTTP

const API_URL = 'http://localhost:4002/api';
const SSE_URL = 'http://localhost:4002/sse';

export interface User {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  status: 'online' | 'offline' | 'away';
}

export interface Room {
  id: string;
  name?: string;
  type: 'private' | 'group';
  createdBy: string;
  members: Array<{
    userId: string;
    role: 'admin' | 'member';
    user: User;
  }>;
  messages?: Message[];
}

export interface Message {
  id: string;
  roomId: string;
  content: string;
  type: 'text' | 'system' | 'file';
  isDeleted?: boolean;
  isEdited?: boolean;
  editedAt?: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  receipts?: Array<{
    userId: string;
    userName: string;
    readAt: string;
  }>;
  reactions?: Array<{
    emoji: string;
    users: Array<{
      id: string;
      username: string;
      displayName?: string;
      avatarUrl?: string;
    }>;
  }>;
  replyTo?: {
    id: string;
    content: string;
    type: string;
    createdAt: string;
    author: {
      id: string;
      username: string;
      displayName?: string;
    };
  };
}

type MessageCallback = (message: { type: string; payload: any }) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

export class SSEService {
  private token: string;
  private eventSource: EventSource | null = null;
  private messageCallback?: MessageCallback;
  private statusCallback?: StatusCallback;
  private latencyStart: number = 0;
  private currentLatency: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimeout?: NodeJS.Timeout;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Połącz się z serwerem przez SSE
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.updateStatus('connecting');
        
        // Zamknij poprzednie połączenie jeśli istnieje
        if (this.eventSource) {
          this.eventSource.close();
        }

        // Utwórz nowe połączenie SSE
        const url = `${SSE_URL}?token=${encodeURIComponent(this.token)}`;
        this.eventSource = new EventSource(url);

        // Event: połączenie nawiązane
        this.eventSource.onopen = () => {
          console.log('✅ SSE connected');
          this.updateStatus('connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        // Event: błąd połączenia
        this.eventSource.onerror = (error) => {
          console.error('❌ SSE error:', error);
          this.updateStatus('error');
          
          // Auto-reconnect
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            
            console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
            
            this.reconnectTimeout = setTimeout(() => {
              this.connect();
            }, delay);
          } else {
            console.error('❌ Max reconnect attempts reached');
            reject(new Error('Failed to connect to SSE server'));
          }
        };

        // Dodaj listenery dla wszystkich typów eventów
        this.setupEventListeners();

      } catch (error) {
        console.error('❌ Failed to create SSE connection:', error);
        this.updateStatus('error');
        reject(error);
      }
    });
  }

  /**
   * Setup event listeners dla wszystkich typów SSE eventów
   */
  private setupEventListeners() {
    if (!this.eventSource) return;

    const eventTypes = [
      'CONNECTED',
      'NEW_MESSAGE',
      'MESSAGE_EDITED',
      'MESSAGE_DELETED',
      'MESSAGE_READ',
      'REACTION_ADDED',
      'REACTION_REMOVED',
      'USER_TYPING',
      'USER_STOPPED_TYPING',
      'USER_STATUS_CHANGE',
      'ROOM_JOINED',
      'USER_JOINED_ROOM',
      'USER_LEFT_ROOM',
      'GROUP_NAME_UPDATED',
      'REMOVED_FROM_GROUP',
      'LEFT_GROUP',
      'MEMBER_ADDED',
      'MEMBER_REMOVED',
      'MEMBER_LEFT',
      'MEMBER_PROMOTED',
      'MESSAGES_LOADED'
    ];

    eventTypes.forEach(eventType => {
      this.eventSource!.addEventListener(eventType, (event: any) => {
        try {
          const payload = JSON.parse(event.data);
          
          if (this.messageCallback) {
            this.messageCallback({
              type: eventType,
              payload
            });
          }
        } catch (error) {
          console.error(`Error parsing ${eventType} event:`, error);
        }
      });
    });

    // Generic message handler (fallback)
    this.eventSource.addEventListener('message', (event: any) => {
      console.log('📨 SSE message (generic):', event.data);
    });
  }

  /**
   * Callback dla wiadomości SSE
   */
  onMessage(callback: MessageCallback) {
    this.messageCallback = callback;
  }

  /**
   * Callback dla zmian statusu połączenia
   */
  onStatusChange(callback: StatusCallback) {
    this.statusCallback = callback;
  }

  /**
   * Rozłącz SSE
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.updateStatus('disconnected');
    console.log('❌ SSE disconnected');
  }

  /**
   * Update status połączenia
   */
  private updateStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error') {
    if (this.statusCallback) {
      this.statusCallback(status);
    }
  }

  /**
   * Pobierz latencję (szacunkowa dla SSE - ping nie istnieje natywnie)
   */
  getLatency(): number {
    return this.currentLatency;
  }

  // ============================================
  // HTTP API CALLS (zastępują WebSocket send)
  // ============================================

  /**
   * Wyślij wiadomość
   */
  async sendMessage(roomId: string, content: string, replyToId?: string) {
    await this.post('/messages', { roomId, content, replyToId });
  }

  /**
   * Edytuj wiadomość
   */
  async editMessage(messageId: string, content: string) {
    await this.put(`/messages/${messageId}`, { content });
  }

  /**
   * Usuń wiadomość
   */
  async deleteMessage(messageId: string) {
    await this.delete(`/messages/${messageId}`);
  }

  /**
   * Dodaj reakcję
   */
  async addReaction(messageId: string, emoji: string) {
    await this.post('/reactions', { messageId, emoji });
  }

  /**
   * Usuń reakcję
   */
  async removeReaction(messageId: string, emoji: string) {
    await this.deleteWithBody('/reactions', { messageId, emoji });
  }

  /**
   * Rozpocznij pisanie
   */
  async startTyping(roomId: string) {
    await this.post('/typing/start', { roomId });
  }

  /**
   * Zatrzymaj pisanie
   */
  async stopTyping(roomId: string) {
    await this.post('/typing/stop', { roomId });
  }

  /**
   * Oznacz wiadomość jako przeczytaną
   */
  async markAsRead(messageId: string) {
    await this.post(`/messages/${messageId}/read`, {});
  }

  /**
   * Dołącz do pokoju
   */
  async joinRoom(roomId: string) {
    await this.post(`/rooms/${roomId}/join`, {});
  }

  /**
   * Pobierz pokoje użytkownika
   */
  async getRooms(): Promise<Room[]> {
    const response = await this.get('/rooms');
    return response.rooms;
  }

  /**
   * Utwórz prywatny pokój
   */
  async createPrivateRoom(targetUserId: string): Promise<Room> {
    const response = await this.post('/rooms/private', { targetUserId });
    return response.room;
  }

  /**
   * Utwórz grupę
   */
  async createGroupRoom(name: string, memberIds: string[]): Promise<Room> {
    const response = await this.post('/rooms/group', { name, memberIds });
    return response.room;
  }

  /**
   * Załaduj więcej wiadomości
   */
  async loadMoreMessages(roomId: string, before: string, limit: number = 50) {
    const response = await this.get(`/messages/room/${roomId}?before=${before}&limit=${limit}`);
    return response.messages;
  }

  // ============================================
  // GENERIC HTTP HELPERS
  // ============================================

  private async post(endpoint: string, data: any): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  private async put(endpoint: string, data: any): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  private async delete(endpoint: string): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  private async deleteWithBody(endpoint: string, data: any): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  private async get(endpoint: string): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  /**
   * Update group name
   */
  async updateGroupName(roomId: string, name: string) {
    await this.put(`/rooms/${roomId}/name`, { name });
  }

  /**
   * Remove member from group
   */
  async removeMember(roomId: string, userId: string) {
    await this.delete(`/rooms/${roomId}/members/${userId}`);
  }

  /**
   * Promote member to admin
   */
  async promoteToAdmin(roomId: string, userId: string) {
    await this.post(`/rooms/${roomId}/members/${userId}/promote`, {});
  }

  /**
   * Leave group
   */
  async leaveGroup(roomId: string) {
    await this.post(`/rooms/${roomId}/leave`, {});
  }

  /**
   * Add member to room
   */
  async addMemberToRoom(roomId: string, userId: string) {
    await this.post(`/rooms/${roomId}/members`, { userId });
  }
}
