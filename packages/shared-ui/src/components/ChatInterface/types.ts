export interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  type: 'user' | 'system';
}

export interface ChatUser {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen?: number;
}

export interface ChatInterfaceProps {
  currentUserId?: string;
  currentUserName?: string;
  adapter?: any;
  serverUrl?: string;
}