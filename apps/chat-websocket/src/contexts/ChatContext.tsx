import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useAuth } from '@realtime-thesis/shared-ui/src/contexts/AuthContext';
import { WebSocketService, Room, Message } from '../services/WebSocketService';
import { MetricsCollector } from '../services/MetricsCollector';

interface ChatContextType {
  rooms: Room[];
  currentRoom: Room | null;
  messages: Message[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  latency: number;
  typingUsers: string[];
  selectRoom: (roomId: string) => void;
  sendMessage: (content: string, replyToId?: string) => void;
  startTyping: () => void;
  stopTyping: () => void;
  createPrivateRoom: (targetUserId: string) => Promise<void>;
  createGroupRoom: (name: string, memberIds: string[]) => Promise<void>;
  loadRooms: () => Promise<void>;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  markMessagesAsRead: (messageIds: string[]) => void;
  updateGroupName: (roomId: string, name: string) => void;
  removeMember: (roomId: string, userId: string) => void;
  promoteToAdmin: (roomId: string, userId: string) => void;
  leaveGroup: (roomId: string) => void;
  addMemberToRoom: (roomId: string, userId: string) => void;
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  isLoadingMessages: boolean;
  metrics: MetricsCollector;
  addReaction: (messageId: string, emoji: string) => void;
  removeReaction: (messageId: string, emoji: string) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within ChatProvider');
  return context;
};

const API_URL = 'http://localhost:4001/api';

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [wsService, setWsService] = useState<WebSocketService | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [latency, setLatency] = useState(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState<string | null>(null);

  const metricsRef = useRef(new MetricsCollector());
  
  const currentRoomRef = useRef<Room | null>(null);
  
  // NOWE: Timeouty dla typing indicators (3 sekundy)
  const typingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  // NOWE: Cleanup typing timeouts on unmount
  useEffect(() => {
    return () => {
      typingTimeouts.current.forEach(timeout => clearTimeout(timeout));
      typingTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    const ws = new WebSocketService(token);
    setWsService(ws);

    ws.onStatusChange((status) => {
      setConnectionStatus(status);
      
      if (status === 'disconnected') {
        metricsRef.current.trackDisconnect();
      } else if (status === 'connected') {
        metricsRef.current.trackReconnect();
      }
    });

    ws.onMessage((message) => {
      switch (message.type) {
        case 'CONNECTED':
          console.log('Connected to chat server', message.payload);
          setRooms(message.payload.rooms || []);
          break;

        case 'NEW_MESSAGE':
          if (currentRoomRef.current && message.payload.roomId === currentRoomRef.current.id) {
            setMessages(prev => {
              // Sprawdź czy wiadomość już istnieje (unikaj duplikatów)
              if (prev.some(m => m.id === message.payload.id)) {
                return prev;
              }
              
              // Dodaj nową wiadomość
              return [...prev, {
                ...message.payload,
                // Upewnij się że reactions jest array
                reactions: message.payload.reactions || [],
                // replyTo może być null
                replyTo: message.payload.replyTo || null
              }];
            });
            
            // NOWE: Usuń typing indicator autora wiadomości
            const authorName = message.payload.author?.displayName;
            setTypingUsers(prev => prev.filter(name => name !== authorName));
            
            // Wyczyść timeout dla tego użytkownika
            if (typingTimeouts.current.has(authorName)) {
              clearTimeout(typingTimeouts.current.get(authorName));
              typingTimeouts.current.delete(authorName);
            }
          }
           if (message.payload.message.author.id === user?.id) {
            metricsRef.current.trackMessageReceived(
              message.payload.message.id,
              message.payload.message.content
            );
          }
          
          setRooms(prev => prev.map(room => 
            room.id === message.payload.roomId 
              ? { ...room, messages: [message.payload.message] }
              : room
          ));
          break;

        case 'MESSAGES_LOADED':
        // Historia załadowana
        if (currentRoomRef.current && message.payload.roomId === currentRoomRef.current.id) {
          const newMessages = message.payload.messages || [];
          
          if (newMessages.length < 50) {
            setHasMoreMessages(false);
          }
          
          if (newMessages.length > 0) {
            setOldestMessageTimestamp(newMessages[0].createdAt);
            setMessages(prev => [...newMessages, ...prev]);
          }
          
          setIsLoadingMessages(false);
        }
        break;

        case 'ROOM_JOINED':
          // Wyczyść wszystkie typing timeouts
          typingTimeouts.current.forEach(timeout => clearTimeout(timeout));
          typingTimeouts.current.clear();
          
          setCurrentRoom(message.payload.room);
          setMessages(message.payload.messages || []);
          setTypingUsers([]);
          break;

        case 'REACTION_ADDED':
        case 'REACTION_REMOVED':
          console.log('Reaction update received:', message.payload);
          
          // Zaktualizuj wiadomość z nowymi reakcjami
          setMessages(prev => prev.map(msg =>
            msg.id === message.payload.messageId
              ? { ...msg, reactions: message.payload.reactions }
              : msg
          ));
          break;

        case 'USER_TYPING':
          if (currentRoomRef.current && 
              message.payload.roomId === currentRoomRef.current.id && 
              message.payload.userId !== user?.id) {
            
            const displayName = message.payload.displayName || message.payload.username;
            
            // NOWE: Wyczyść stary timeout dla tego użytkownika
            if (typingTimeouts.current.has(displayName)) {
              clearTimeout(typingTimeouts.current.get(displayName)!);
            }
            
            // Dodaj użytkownika do typing
            setTypingUsers(prev => {
              if (!prev.includes(displayName)) {
                return [...prev, displayName];
              }
              return prev;
            });
            
            // NOWE: Ustaw timeout 3 sekundy - auto usuń jeśli nie dostaniemy STOPPED
            const timeout = setTimeout(() => {
              setTypingUsers(prev => prev.filter(name => name !== displayName));
              typingTimeouts.current.delete(displayName);
            }, 3000);
            
            typingTimeouts.current.set(displayName, timeout);
          }
          break;

        case 'USER_STOPPED_TYPING':
          if (currentRoomRef.current && message.payload.roomId === currentRoomRef.current.id) {
            const displayName = message.payload.displayName || message.payload.username;
            
            // NOWE: Wyczyść timeout
            if (typingTimeouts.current.has(displayName)) {
              clearTimeout(typingTimeouts.current.get(displayName)!);
              typingTimeouts.current.delete(displayName);
            }
            
            setTypingUsers(prev => prev.filter(name => name !== displayName));
          }
          break;

        case 'USER_STATUS_CHANGE':
          setRooms(prev => prev.map(room => ({
            ...room,
            members: room.members.map(member =>
              member.id === message.payload.userId
                ? { ...member, status: message.payload.status }
                : member
            )
          })));
          break;
          
        case 'USER_LEFT_ROOM':
          // NOWE: Gdy użytkownik opuszcza pokój, usuń jego typing indicator
          if (currentRoomRef.current && message.payload.roomId === currentRoomRef.current.id) {
            const userName = message.payload.userName;
            if (userName) {
              if (typingTimeouts.current.has(userName)) {
                clearTimeout(typingTimeouts.current.get(userName)!);
                typingTimeouts.current.delete(userName);
              }
              setTypingUsers(prev => prev.filter(name => name !== userName));
            }
          }
          break;

        case 'MESSAGE_EDITED':
      if (currentRoomRef.current && message.payload.messageId) {
        setMessages(prev => prev.map(msg => 
          msg.id === message.payload.messageId
            ? {
                ...msg,
                content: message.payload.content,
                isEdited: true,
                editedAt: message.payload.editedAt
              }
            : msg
        ));
      }
      break;

    case 'MESSAGE_DELETED':
      if (currentRoomRef.current && message.payload.messageId) {
        setMessages(prev => prev.map(msg => 
          msg.id === message.payload.messageId
            ? {
                ...msg,
                content: 'This message was deleted',
                isDeleted: true
              }
            : msg
        ));
      }
      break;

    case 'MESSAGE_READ':
      if (currentRoomRef.current && message.payload.messageId) {
        setMessages(prev => prev.map(msg => 
          msg.id === message.payload.messageId
            ? {
                ...msg,
                receipts: [
                  ...(msg.receipts || []),
                  {
                    userId: message.payload.userId,
                    userName: message.payload.userName,
                    readAt: message.payload.readAt
                  }
                ]
              }
            : msg
        ));
      }
      break;

      case 'GROUP_NAME_UPDATED':
  setRooms(prev => prev.map(room => 
    room.id === message.payload.roomId
      ? { ...room, name: message.payload.name }
      : room
  ));
  if (currentRoomRef.current?.id === message.payload.roomId) {
    setCurrentRoom(prev => prev ? { ...prev, name: message.payload.name } : null);
  }
  break;

case 'REMOVED_FROM_GROUP':
  setRooms(prev => prev.filter(room => room.id !== message.payload.roomId));
  if (currentRoomRef.current?.id === message.payload.roomId) {
    setCurrentRoom(null);
  }
  break;

case 'LEFT_GROUP':
  setRooms(prev => prev.filter(room => room.id !== message.payload.roomId));
  if (currentRoomRef.current?.id === message.payload.roomId) {
    setCurrentRoom(null);
  }
  break;

case 'MEMBER_ADDED':
        setRooms(prev => prev.map(room => {
          if (room.id === message.payload.roomId) {
            return {
              ...room,
              members: [...room.members, message.payload.member]
            };
          }
          return room;
        }));
        if (currentRoomRef.current?.id === message.payload.roomId) {
          setCurrentRoom(prev => prev ? {
            ...prev,
            members: [...prev.members, message.payload.member]
          } : null);
        }
        break;

case 'MEMBER_REMOVED':
  setRooms(prev => prev.map(room => {
          if (room.id === message.payload.roomId) {
            return {
              ...room,
              members: room.members.filter(m => m.userId !== message.payload.userId)
            };
          }
          return room;
        }));
        if (currentRoomRef.current?.id === message.payload.roomId) {
          setCurrentRoom(prev => prev ? {
            ...prev,
            members: prev.members.filter(m => m.userId !== message.payload.userId)
          } : null);
        }
        break;
case 'MEMBER_LEFT':
  setRooms(prev => prev.map(room => {
          if (room.id === message.payload.roomId) {
            return {
              ...room,
              members: room.members.filter(m => m.userId !== message.payload.userId)
            };
          }
          return room;
        }));
        if (currentRoomRef.current?.id === message.payload.roomId) {
          setCurrentRoom(prev => prev ? {
            ...prev,
            members: prev.members.filter(m => m.userId !== message.payload.userId)
          } : null);
        }
        break;
case 'MEMBER_PROMOTED':
  loadRooms();
  break;
      }
    });

    ws.connect().then(() => {
      console.log('WebSocket connected successfully');
    }).catch(error => {
      console.error('Failed to connect WebSocket:', error);
    });

    const latencyInterval = setInterval(() => {
      setLatency(ws.getLatency());
    }, 1000);

    return () => {
      // Cleanup wszystkich timeouts
      typingTimeouts.current.forEach(timeout => clearTimeout(timeout));
      typingTimeouts.current.clear();
      
      ws.disconnect();
      clearInterval(latencyInterval);
    };
  }, [token, user?.id]);

  const loadRooms = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/rooms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setRooms(data.rooms);
      }
    } catch (error) {
      console.error('Failed to load rooms:', error);
    }
  }, [token]);

  const editMessage = useCallback((messageId: string, content: string) => {
  wsService?.send({
    type: 'EDIT_MESSAGE',
    payload: { messageId, content }
  });
}, [wsService]);

const deleteMessage = useCallback((messageId: string) => {
  wsService?.send({
    type: 'DELETE_MESSAGE',
    payload: { messageId }
  });
}, [wsService]);

const markMessagesAsRead = useCallback((messageIds: string[]) => {
  if (messageIds.length === 0) return;
  
  wsService?.send({
    type: 'MARK_AS_READ',
    payload: { messageIds }
  });
}, [wsService]);

const updateGroupName = useCallback((roomId: string, name: string) => {
  wsService?.send({
    type: 'UPDATE_GROUP_NAME',
    payload: { roomId, name }
  });
}, [wsService]);

const removeMember = useCallback((roomId: string, userId: string) => {
  wsService?.send({
    type: 'REMOVE_MEMBER',
    payload: { roomId, userId }
  });
}, [wsService]);

const promoteToAdmin = useCallback((roomId: string, userId: string) => {
  wsService?.send({
    type: 'PROMOTE_TO_ADMIN',
    payload: { roomId, userId }
  });
}, [wsService]);

const leaveGroup = useCallback((roomId: string) => {
  wsService?.send({
    type: 'LEAVE_GROUP',
    payload: { roomId }
  });
}, [wsService]);

const addMemberToRoom = useCallback((roomId: string, userId: string) => {
  wsService?.send({
    type: 'ADD_MEMBER',
    payload: { roomId, userId }
  });
}, [wsService]);

  const selectRoom = useCallback((roomId: string) => {
    wsService?.send({
      type: 'JOIN_ROOM',
      payload: { roomId }
    });
  }, [wsService]);

  const loadMoreMessages = useCallback(async () => {
    if (!currentRoom || !wsService || isLoadingMessages || !hasMoreMessages) {
      return;
    }

    setIsLoadingMessages(true);
    
    wsService.send({
      type: 'LOAD_MORE_MESSAGES',
      payload: {
        roomId: currentRoom.id,
        before: oldestMessageTimestamp || messages[0]?.createdAt,
        limit: 50
      }
    });
  }, [currentRoom, wsService, isLoadingMessages, hasMoreMessages, oldestMessageTimestamp, messages]);

  const addReaction = useCallback((messageId: string, emoji: string) => {
  if (!wsService) return;
  
  console.log('Adding reaction:', messageId, emoji);
  
  wsService.send({
    type: 'ADD_REACTION',
    payload: { messageId, emoji }
  });
}, [wsService]);

const removeReaction = useCallback((messageId: string, emoji: string) => {
  if (!wsService) return;
  
  console.log('Removing reaction:', messageId, emoji);
  
  wsService.send({
    type: 'REMOVE_REACTION',
    payload: { messageId, emoji }
  });
}, [wsService]);

  const sendMessage = useCallback((content: string, replyToId?: string) => {
    if (!currentRoom || !wsService) return;

    const messageId = `temp-${Date.now()}-${Math.random()}`;
    
    // Track wysłanie
    metricsRef.current.trackMessageSent(messageId, content);

    wsService.send({
      type: 'SEND_MESSAGE',
      payload: {
        roomId: currentRoom.id,
        content,
        tempId: messageId,
        replyToId
      }
    });
  }, [currentRoom, wsService]);

  const startTyping = useCallback(() => {
    if (!currentRoom || !wsService) return;

    wsService.send({
      type: 'TYPING_START',
      payload: { roomId: currentRoom.id }
    });
  }, [currentRoom, wsService]);

  const stopTyping = useCallback(() => {
    if (!currentRoom || !wsService) return;

    wsService.send({
      type: 'TYPING_STOP',
      payload: { roomId: currentRoom.id }
    });
  }, [currentRoom, wsService]);

  const createPrivateRoom = useCallback(async (targetUserId: string) => {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/rooms/private`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId })
      });

      if (response.ok) {
        const data = await response.json();
        await loadRooms();
        selectRoom(data.room.id);
      }
    } catch (error) {
      console.error('Failed to create private room:', error);
    }
  }, [token, loadRooms, selectRoom]);

  const createGroupRoom = useCallback(async (name: string, memberIds: string[]) => {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/rooms/group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, memberIds })
      });

      if (response.ok) {
        const data = await response.json();
        await loadRooms();
        selectRoom(data.room.id);
      }
    } catch (error) {
      console.error('Failed to create group room:', error);
    }
  }, [token, loadRooms, selectRoom]);

  const value = {
    rooms,
    currentRoom,
    messages,
    connectionStatus,
    latency,
    typingUsers,
    selectRoom,
    sendMessage,
    startTyping,
    stopTyping,
    createPrivateRoom,
    createGroupRoom,
    loadRooms,
    editMessage,
    deleteMessage,
    markMessagesAsRead,
    updateGroupName,
    removeMember,
    promoteToAdmin,
    leaveGroup,
    addMemberToRoom,
    loadMoreMessages,
    hasMoreMessages,
    isLoadingMessages,
    metrics: metricsRef.current,
    addReaction,
    removeReaction
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};