import { WebSocket } from 'ws';

interface ChatUser {
  id: string;
  name: string;
  ws: WebSocket;
  status: 'online' | 'offline';
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  type: 'user' | 'system';
}

export class ChatRoom {
  private users: Map<string, ChatUser> = new Map();
  private messages: ChatMessage[] = [];

  addUser(ws: WebSocket, userId: string, userName: string) {
    const user: ChatUser = {
      id: userId,
      name: userName,
      ws,
      status: 'online'
    };

    this.users.set(userId, user);

    // Wyślij pełny stan do nowego użytkownika
    this.sendToUser(userId, {
      type: 'FULL_STATE',
      payload: {
        messages: this.messages,
        users: Array.from(this.users.values()).map(u => ({
          id: u.id,
          name: u.name,
          status: u.status
        }))
      }
    });

    // Powiadom wszystkich o nowym użytkowniku
    this.broadcast({
      type: 'USER_JOINED',
      payload: {
        user: {
          id: user.id,
          name: user.name,
          status: 'online'
        }
      }
    }, userId);

    console.log(`✅ User ${userName} (${userId}) joined. Total users: ${this.users.size}`);
  }

  removeUser(userId: string) {
    const user = this.users.get(userId);
    if (user) {
      this.users.delete(userId);
      
      this.broadcast({
        type: 'USER_LEFT',
        payload: {
          userId: user.id,
          userName: user.name
        }
      });

      console.log(`❌ User ${user.name} (${userId}) left. Total users: ${this.users.size}`);
    }
  }

  handleMessage(userId: string, message: any) {
    const user = this.users.get(userId);
    if (!user) return;

    switch (message.type) {
      case 'SEND_MESSAGE':
        const chatMessage: ChatMessage = {
          ...message.payload,
          timestamp: Date.now()
        };
        this.messages.push(chatMessage);
        
        // Broadcast do wszystkich
        this.broadcast({
          type: 'MESSAGE',
          payload: chatMessage
        });
        break;

      case 'USER_TYPING':
        this.broadcast({
          type: 'USER_TYPING',
          payload: message.payload
        }, userId);
        break;

      case 'USER_STOPPED_TYPING':
        this.broadcast({
          type: 'USER_STOPPED_TYPING',
          payload: message.payload
        }, userId);
        break;
    }
  }

  private sendToUser(userId: string, message: any) {
    const user = this.users.get(userId);
    if (user && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: any, excludeUserId?: string) {
    const messageStr = JSON.stringify(message);
    this.users.forEach((user, userId) => {
      if (userId !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(messageStr);
      }
    });
  }
}