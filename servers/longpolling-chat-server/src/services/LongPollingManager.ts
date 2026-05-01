// servers/longpolling-server/src/services/LongPollingManager.ts

import { User } from '@realtime-thesis/shared-server/models/chat';

interface Event {
  id: number;
  type: string;
  payload: any;
  timestamp: number;
}

interface PendingRequest {
  resolve: (events: Event[]) => void;
  timeout: NodeJS.Timeout;
  lastEventId: number;
}

interface UserSession {
  userId: string;
  user: User;
  rooms: Set<string>;
  lastActivity: number;
}

export class LongPollingManager {
  private eventQueues: Map<string, Event[]> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private roomMembers: Map<string, Set<string>> = new Map();
  private userSessions: Map<string, UserSession> = new Map();
  private eventIdCounter: number = 0;
  private readonly POLL_TIMEOUT = parseInt(process.env.POLL_TIMEOUT || '30000');
  private readonly MAX_EVENTS_PER_POLL = parseInt(process.env.MAX_EVENTS_PER_POLL || '50');
  private readonly SESSION_TIMEOUT = 60000; // 1 minuta bez aktywności

  constructor() {
    // Cleanup nieaktywnych sesji co 30s
    setInterval(() => this.cleanupInactiveSessions(), 30000);
  }

  /**
   * Rejestruj sesję użytkownika
   */
  registerUser(userId: string, user: User, initialRooms: string[] = []) {
    console.log(`📡 Long Polling: User ${user.username} registered`);

    const session: UserSession = {
      userId,
      user,
      rooms: new Set(initialRooms),
      lastActivity: Date.now()
    };

    this.userSessions.set(userId, session);

    // Dodaj do pokoi
    initialRooms.forEach(roomId => {
      if (!this.roomMembers.has(roomId)) {
        this.roomMembers.set(roomId, new Set());
      }
      this.roomMembers.get(roomId)!.add(userId);
    });

    // Zainicjuj kolejkę eventów
    if (!this.eventQueues.has(userId)) {
      this.eventQueues.set(userId, []);
    }

    console.log(`✅ Long Polling: User ${user.username} session created. Total: ${this.userSessions.size}`);
  }

  /**
   * Long poll - czekaj na eventy (lub timeout)
   */
  async waitForEvents(userId: string, lastEventId: number): Promise<Event[]> {
    // Aktualizuj aktywność
    const session = this.userSessions.get(userId);
    if (session) {
      session.lastActivity = Date.now();
    }

    // Sprawdź czy są już eventy w kolejce
    const existingEvents = this.getNewEvents(userId, lastEventId);
    if (existingEvents.length > 0) {
      console.log(`📤 Long Polling: Returning ${existingEvents.length} queued events to ${userId}`);
      return existingEvents;
    }

    // Jeśli nie ma eventów, czekaj (Long Polling!)
    return new Promise((resolve) => {
      console.log(`⏳ Long Polling: User ${userId} waiting for events (lastEventId: ${lastEventId})`);

      // Cancel poprzedni pending request jeśli istnieje
      const existing = this.pendingRequests.get(userId);
      if (existing) {
        clearTimeout(existing.timeout);
      }

      // Ustaw timeout
      const timeout = setTimeout(() => {
        console.log(`⏰ Long Polling: Timeout for user ${userId}`);
        this.pendingRequests.delete(userId);
        resolve([]); // Zwróć pustą tablicę po timeout
      }, this.POLL_TIMEOUT);

      // Zapisz pending request
      this.pendingRequests.set(userId, {
        resolve,
        timeout,
        lastEventId
      });
    });
  }

  /**
   * Dodaj event do kolejki użytkownika
   */
  addEventToUser(userId: string, type: string, payload: any) {
    const event: Event = {
      id: ++this.eventIdCounter,
      type,
      payload,
      timestamp: Date.now()
    };

    // Dodaj do kolejki
    if (!this.eventQueues.has(userId)) {
      this.eventQueues.set(userId, []);
    }
    this.eventQueues.get(userId)!.push(event);

    console.log(`📥 Long Polling: Added event ${type} (id: ${event.id}) to user ${userId} queue`);

    // Jeśli użytkownik czeka (pending request), odpowiedz natychmiast
    this.resolvePendingRequest(userId);
  }

  /**
   * Broadcast event do wszystkich w pokoju
   */
  broadcastToRoom(roomId: string, type: string, payload: any, excludeUserId?: string) {
    console.log(`📡 Long Polling: Broadcasting ${type} to room ${roomId}`);

    const members = this.roomMembers.get(roomId);
    if (!members || members.size === 0) {
      console.log(`⚠️  No members in room ${roomId}`);
      return;
    }

    let sentCount = 0;
    members.forEach(userId => {
      if (userId !== excludeUserId) {
        this.addEventToUser(userId, type, payload);
        sentCount++;
      }
    });

    console.log(`✅ Long Polling: Broadcasted to ${sentCount} users in room ${roomId}`);
  }

  /**
   * Broadcast do wszystkich użytkowników
   */
  broadcastToAll(type: string, payload: any, excludeUserId?: string) {
    let sentCount = 0;
    this.userSessions.forEach((session, userId) => {
      if (userId !== excludeUserId) {
        this.addEventToUser(userId, type, payload);
        sentCount++;
      }
    });
    console.log(`✅ Long Polling: Broadcasted to ${sentCount} users`);
  }

  /**
   * Dodaj użytkownika do pokoju
   */
  addUserToRoom(userId: string, roomId: string) {
    const session = this.userSessions.get(userId);
    if (!session) {
      console.log(`⚠️  User ${userId} not registered`);
      return false;
    }

    session.rooms.add(roomId);

    if (!this.roomMembers.has(roomId)) {
      this.roomMembers.set(roomId, new Set());
    }
    this.roomMembers.get(roomId)!.add(userId);

    console.log(`➕ Long Polling: User ${session.user.username} joined room ${roomId}`);
    return true;
  }

  /**
   * Usuń użytkownika z pokoju
   */
  removeUserFromRoom(userId: string, roomId: string) {
    const session = this.userSessions.get(userId);
    if (session) {
      session.rooms.delete(roomId);
    }

    const roomUsers = this.roomMembers.get(roomId);
    if (roomUsers) {
      roomUsers.delete(userId);
      if (roomUsers.size === 0) {
        this.roomMembers.delete(roomId);
      }
    }

    console.log(`➖ Long Polling: User ${userId} left room ${roomId}`);
  }

  /**
   * Pobierz nowe eventy od lastEventId
   */
  private getNewEvents(userId: string, lastEventId: number): Event[] {
    const queue = this.eventQueues.get(userId);
    if (!queue) return [];

    // Filtruj eventy nowsze niż lastEventId
    const newEvents = queue.filter(event => event.id > lastEventId);

    // Ogranicz do MAX_EVENTS_PER_POLL
    const eventsToReturn = newEvents.slice(0, this.MAX_EVENTS_PER_POLL);

    // Usuń zwrócone eventy z kolejki (opcjonalnie - można zostawić dla history)
    // Zostaw eventy na wypadek reconnect (usuń tylko stare > 5 min)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    this.eventQueues.set(
      userId,
      queue.filter(event => event.timestamp > fiveMinutesAgo)
    );

    return eventsToReturn;
  }

  /**
   * Rozwiąż pending request dla użytkownika
   */
  private resolvePendingRequest(userId: string) {
    const pending = this.pendingRequests.get(userId);
    if (!pending) return;

    const events = this.getNewEvents(userId, pending.lastEventId);
    if (events.length > 0) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(userId);
      console.log(`✅ Long Polling: Resolving pending request for ${userId} with ${events.length} events`);
      pending.resolve(events);
    }
  }

  /**
   * Cleanup nieaktywnych sesji
   */
  private cleanupInactiveSessions() {
    const now = Date.now();
    const inactiveUsers: string[] = [];

    this.userSessions.forEach((session, userId) => {
      if (now - session.lastActivity > this.SESSION_TIMEOUT) {
        inactiveUsers.push(userId);
      }
    });

    inactiveUsers.forEach(userId => {
      console.log(`🗑️  Long Polling: Removing inactive user ${userId}`);
      
      // Cancel pending request
      const pending = this.pendingRequests.get(userId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve([]);
        this.pendingRequests.delete(userId);
      }

      // Usuń z pokoi
      const session = this.userSessions.get(userId);
      if (session) {
        session.rooms.forEach(roomId => {
          this.roomMembers.get(roomId)?.delete(userId);
        });
      }

      // Usuń sesję i kolejkę
      this.userSessions.delete(userId);
      this.eventQueues.delete(userId);
    });

    if (inactiveUsers.length > 0) {
      console.log(`🗑️  Long Polling: Cleaned up ${inactiveUsers.length} inactive sessions`);
    }
  }

  /**
   * Pobierz liczbę aktywnych sesji
   */
  getActiveSessionsCount(): number {
    return this.userSessions.size;
  }

  /**
   * Pobierz użytkowników online w pokoju
   */
  getOnlineUsersInRoom(roomId: string): string[] {
    const members = this.roomMembers.get(roomId);
    return members ? Array.from(members) : [];
  }

  /**
   * Sprawdź czy użytkownik jest online
   */
  isUserOnline(userId: string): boolean {
    return this.userSessions.has(userId);
  }
}
