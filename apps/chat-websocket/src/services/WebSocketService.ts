export interface Message {
  id: string;
  roomId: string;
  content: string;
  type: 'text' | 'system';
  isDeleted?: boolean;      // NOWE
  isEdited?: boolean;       // NOWE
  editedAt?: string;
  createdAt: string;
  reactions?: Array<{        // DODAJ
    emoji: string;
    users: Array<{
      id: string;
      username: string;
      displayName?: string;
      avatarUrl?: string;
    }>;
  }>;
  replyTo?: {                // DODAJ
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
  author: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  receipts?: Array<{        // NOWE
    userId: string;
    userName: string;
    readAt: string;
  }>;
}

export interface Room {
  id: string;
  name?: string;
  type: 'private' | 'group';
  members: any[];
  messages?: Message[];
}

type MessageHandler = (message: any) => void;
type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private token: string;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isManualDisconnect = false;
  private missedMessages: any[] = [];
  private pingInterval: NodeJS.Timeout | null = null;
  private latency = 0;

  constructor(token: string) {
    this.token = token;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.notifyStatus('connecting');
        this.isManualDisconnect = false;
        
        this.ws = new WebSocket(`ws://localhost:4001/ws?token=${this.token}`);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected');
          this.notifyStatus('connected');
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.startPing();
          this.sendMissedMessages();
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          this.notifyStatus('error');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('🔌 WebSocket disconnected');
          this.notifyStatus('disconnected');
          this.stopPing();
          if (!this.isManualDisconnect) {
            this.attemptReconnect();
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'PONG') {
              this.latency = Date.now() - (message.payload?.timestamp || Date.now());
            } else {
              this.notifyMessage(message);
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    this.isManualDisconnect = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }

  send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
      if (message.type === 'SEND_MESSAGE') {
        this.missedMessages.push(message);
      }
    }
  }

   private sendMissedMessages() {
    if (this.missedMessages.length > 0) {
      console.log(`📤 Sending ${this.missedMessages.length} queued messages`);
      
      this.missedMessages.forEach(message => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(message));
        }
      });
      
      this.missedMessages = [];
    }
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onStatusChange(handler: StatusHandler) {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  getLatency() {
    return this.latency;
  }

  private notifyMessage(message: any) {
    this.messageHandlers.forEach(handler => handler(message));
  }

  private notifyStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error') {
    this.statusHandlers.forEach(handler => handler(status));
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'PING', payload: { timestamp: Date.now() } });
    }, 30000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.notifyStatus('error');
      return;
    }

    this.reconnectAttempts++;
    
    // Exponential backoff z cap
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`🔄 Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  manualReconnect() {
    this.reconnectAttempts = 0;
    this.attemptReconnect();
  }

  // NOWE: Status kolejki
  getQueuedMessagesCount(): number {
    return this.missedMessages.length;
  }
}