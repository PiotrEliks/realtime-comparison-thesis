// src/services/WebSocketService.ts - FIXED

import type { Message, MessageType } from '../types';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<MessageType, Set<(payload: any) => void>> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;

  connect(token: string, url: string = 'ws://localhost:5002'): Promise<void> {
    // Prevent multiple simultaneous connections
    if (this.isConnecting) {
      console.log('⏳ Connection already in progress...');
      return Promise.resolve();
    }

    // If already connected, reuse connection
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('✅ Already connected, reusing connection');
      return Promise.resolve();
    }

    // Close any existing connection first
    if (this.ws) {
      console.log('🔄 Closing existing connection...');
      this.ws.close();
      this.ws = null;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 Connecting to WebSocket:', url);
        this.ws = new WebSocket(`${url}?token=${token}`);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected successfully!');
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: Message = JSON.parse(event.data);
            console.log('📨 Received:', message.type, message.payload);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log('🔌 WebSocket disconnected:', event.code, event.reason);
          this.isConnecting = false;
          this.ws = null;
          
          // Only reconnect if not a normal close
          if (event.code !== 1000) {
            this.attemptReconnect(token, url);
          }
        };

      } catch (error) {
        console.error('❌ Error creating WebSocket:', error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  disconnect() {
    console.log('🔌 Disconnecting WebSocket...');
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      // Send BOARD_LEFT before closing
      if (this.ws.readyState === WebSocket.OPEN) {
        console.log('📤 Sending BOARD_LEFT before disconnect');
      }
      
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.isConnecting = false;
  }

  send(type: MessageType, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message: Message = {
        type,
        payload,
        timestamp: Date.now()
      };
      console.log('📤 Sending:', type, payload);
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('❌ Cannot send, WebSocket not connected. State:', this.ws?.readyState);
      console.error('   Message type:', type);
    }
  }

  on(type: MessageType, handler: (payload: any) => void) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);

    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  off(type: MessageType, handler: (payload: any) => void) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private handleMessage(message: Message) {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers && handlers.size > 0) {
      console.log(`📨 Calling ${handlers.size} handlers for ${message.type}`);
      handlers.forEach(handler => {
        try {
          handler(message.payload);
        } catch (error) {
          console.error(`Error in handler for ${message.type}:`, error);
        }
      });
    } else {
      console.warn(`⚠️ No handlers registered for ${message.type}`);
    }
  }

  private attemptReconnect(token: string, url: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect(token, url).catch(err => {
        console.error('Reconnect failed:', err);
      });
    }, delay);
  }

  getConnectionState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// IMPORTANT: Export singleton instance
export const wsService = new WebSocketService();