import { Response } from 'express';
import { User } from '@realtime-thesis/shared-server/models/chat';

interface SSEClient {
  userId: string;
  response: Response;
  user: User;
  rooms: Set<string>;
  lastPing: number;
}

export class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private roomClients: Map<string, Set<string>> = new Map();

  /**
   * Dodaje nowe połączenie SSE
   */
  addClient(userId: string, response: Response, user: User, initialRooms: string[] = []) {
    console.log(`📡 SSE: User ${user.username} connecting...`);

    // Jeśli użytkownik już jest połączony, rozłącz stare połączenie
    if (this.clients.has(userId)) {
      const oldClient = this.clients.get(userId);
      oldClient?.response.end();
      this.removeClient(userId);
    }

    // Ustawienie nagłówków SSE
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // Dla Nginx
    
    // CORS headers
    response.setHeader('Access-Control-Allow-Origin', 'http://localhost:5174');
    response.setHeader('Access-Control-Allow-Credentials', 'true');

    // Flush immediately
    response.flushHeaders();

    // Zapisz klienta
    const rooms = new Set(initialRooms);
    const client: SSEClient = {
      userId,
      response,
      user,
      rooms,
      lastPing: Date.now()
    };
    
    this.clients.set(userId, client);

    // Dodaj do pokoi
    rooms.forEach(roomId => {
      if (!this.roomClients.has(roomId)) {
        this.roomClients.set(roomId, new Set());
      }
      this.roomClients.get(roomId)!.add(userId);
    });

    console.log(`✅ SSE: User ${user.username} connected. Total: ${this.clients.size}`);

    // Wyślij potwierdzenie połączenia
    this.sendToClient(userId, {
      type: 'CONNECTED',
      payload: {
        userId,
        timestamp: Date.now()
      }
    });

    // Keep-alive ping co 30 sekund
    const pingInterval = setInterval(() => {
      if (this.clients.has(userId)) {
        try {
          response.write(': ping\n\n');
          client.lastPing = Date.now();
        } catch (error) {
          clearInterval(pingInterval);
          this.removeClient(userId);
        }
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);

    // Cleanup przy rozłączeniu
    response.on('close', () => {
      console.log(`❌ SSE: User ${user.username} disconnected`);
      clearInterval(pingInterval);
      this.removeClient(userId);
    });

    response.on('error', (error) => {
      console.error(`❌ SSE Error for user ${user.username}:`, error);
      clearInterval(pingInterval);
      this.removeClient(userId);
    });
  }

  /**
   * Wyślij wiadomość do konkretnego użytkownika
   */
  sendToClient(userId: string, message: { type: string; payload: any }) {
    const client = this.clients.get(userId);
    if (!client) {
      console.warn(`⚠️ SSE: Client ${userId} not found`);
      return false;
    }

    try {
      const data = JSON.stringify(message.payload);
      client.response.write(`event: ${message.type}\n`);
      client.response.write(`data: ${data}\n\n`);
      return true;
    } catch (error) {
      console.error(`❌ SSE: Failed to send to ${userId}:`, error);
      this.removeClient(userId);
      return false;
    }
  }

  /**
   * Broadcast wiadomości do wszystkich w pokoju
   */
  broadcastToRoom(roomId: string, message: { type: string; payload: any }, excludeUserId?: string) {
    const clients = this.roomClients.get(roomId);
    if (!clients) {
      console.warn(`⚠️ SSE: Room ${roomId} has no clients`);
      return 0;
    }

    let sent = 0;
    clients.forEach(userId => {
      if (userId !== excludeUserId) {
        if (this.sendToClient(userId, message)) {
          sent++;
        }
      }
    });

    console.log(`📤 SSE: Broadcast ${message.type} to room ${roomId}: ${sent} clients`);
    return sent;
  }

  /**
   * Dodaj użytkownika do pokoju
   */
  addUserToRoom(userId: string, roomId: string) {
    const client = this.clients.get(userId);
    if (!client) return false;

    client.rooms.add(roomId);

    if (!this.roomClients.has(roomId)) {
      this.roomClients.set(roomId, new Set());
    }
    this.roomClients.get(roomId)!.add(userId);

    console.log(`➕ SSE: User ${client.user.username} joined room ${roomId}`);
    return true;
  }

  /**
   * Usuń użytkownika z pokoju
   */
  removeUserFromRoom(userId: string, roomId: string) {
    const client = this.clients.get(userId);
    if (client) {
      client.rooms.delete(roomId);
    }

    const roomUsers = this.roomClients.get(roomId);
    if (roomUsers) {
      roomUsers.delete(userId);
      if (roomUsers.size === 0) {
        this.roomClients.delete(roomId);
      }
    }

    console.log(`➖ SSE: User ${userId} left room ${roomId}`);
  }

  /**
   * Usuń klienta całkowicie
   */
  private removeClient(userId: string) {
    const client = this.clients.get(userId);
    if (!client) return;

    // Usuń ze wszystkich pokoi
    client.rooms.forEach(roomId => {
      this.roomClients.get(roomId)?.delete(userId);
    });

    // Usuń klienta
    this.clients.delete(userId);
    
    console.log(`🗑️ SSE: Removed client ${userId}. Total: ${this.clients.size}`);
  }

  /**
   * Sprawdź czy użytkownik jest online
   */
  isUserOnline(userId: string): boolean {
    return this.clients.has(userId);
  }

  /**
   * Pobierz liczbę aktywnych połączeń
   */
  getActiveConnections(): number {
    return this.clients.size;
  }

  /**
   * Pobierz użytkowników online w pokoju
   */
  getOnlineUsersInRoom(roomId: string): string[] {
    const clients = this.roomClients.get(roomId);
    return clients ? Array.from(clients) : [];
  }

  /**
   * Broadcast do wszystkich połączonych użytkowników
   */
  broadcastToAll(message: { type: string; payload: any }, excludeUserId?: string) {
    let sent = 0;
    this.clients.forEach((client, userId) => {
      if (userId !== excludeUserId) {
        if (this.sendToClient(userId, message)) {
          sent++;
        }
      }
    });
    return sent;
  }

  /**
   * Pobierz informacje o kliencie
   */
  getClient(userId: string): SSEClient | undefined {
    return this.clients.get(userId);
  }
}
