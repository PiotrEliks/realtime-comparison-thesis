import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@realtime-thesis/shared-ui/src/contexts/AuthContext';
import { SSEService, Room, Message } from '../services/SSEService';
import { MetricsCollector } from '../services/MetricsCollector';

interface ChatContextType {
  // State
  rooms: Room[];
  currentRoom: Room | null;
  messages: Message[];
  typingUsers: string[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  latency: number;
  replyingTo: Message | null;
  hasMoreMessages: boolean;
  isLoadingMessages: boolean;
  
  // Metrics
  metrics: MetricsCollector;
  
  // Room actions
  selectRoom: (roomId: string) => void;
  createPrivateRoom: (targetUserId: string) => Promise<void>;
  createGroupRoom: (name: string, memberIds: string[]) => Promise<void>;
  
  // Message actions
  sendMessage: (content: string, replyToId?: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  markMessageAsRead: (messageId: string) => Promise<void>;
  markMessagesAsRead: (messageIds: string[]) => Promise<void>;
  
  // Reaction actions
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  
  // Typing actions
  startTyping: () => void;
  stopTyping: () => void;
  
  // Group management actions
  updateGroupName: (roomId: string, name: string) => Promise<void>;
  removeMember: (roomId: string, userId: string) => Promise<void>;
  promoteToAdmin: (roomId: string, userId: string) => Promise<void>;
  leaveGroup: (roomId: string) => Promise<void>;
  addMemberToRoom: (roomId: string, userId: string) => Promise<void>;
  
  // Reply action
  setReplyingTo: (message: Message | null) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within ChatProvider');
  return context;
};

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  
  // State
  const [sseService, setSSEService] = useState<SSEService | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [latency, setLatency] = useState<number>(0);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);

  // Refs
  const currentRoomRef = useRef<Room | null>(null);
  const typingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const metricsRef = useRef(new MetricsCollector());
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);

  // Sync currentRoom to ref
  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  // Initialize SSE connection
  useEffect(() => {
    if (!token) {
      setSSEService(null);
      setConnectionStatus('disconnected');
      return;
    }

    const sse = new SSEService(token);
    setSSEService(sse);

    // Status change handler
    sse.onStatusChange((status) => {
      setConnectionStatus(status);
      if (status === 'disconnected') {
        metricsRef.current.trackDisconnect();
      } else if (status === 'connected') {
        metricsRef.current.trackReconnect();
      }
    });

    // Message handler
    sse.onMessage((message) => {
      handleSSEMessage(message);
    });

    // Connect
    sse.connect().catch((error) => {
      console.error('Failed to connect SSE:', error);
      setConnectionStatus('error');
    });

    return () => {
      sse.disconnect();
    };
  }, [token]);

  // Update latency periodically
  useEffect(() => {
    if (!sseService) return;

    const interval = setInterval(() => {
      setLatency(sseService.getLatency());
    }, 1000);

    return () => clearInterval(interval);
  }, [sseService]);

  // Handle SSE messages
  const handleSSEMessage = useCallback((message: { type: string; payload: any }) => {
    console.log('📨 SSE Message:', message.type, message.payload);

    switch (message.type) {
      case 'CONNECTED':
        console.log('✅ SSE Connected:', message.payload);
        if (message.payload.rooms) {
          setRooms(message.payload.rooms);
        }
        break;

      case 'NEW_MESSAGE':
        if (currentRoomRef.current && message.payload.roomId === currentRoomRef.current.id) {
          setMessages(prev => {
            if (prev.some(m => m.id === message.payload.id)) {
              return prev;
            }
            return [...prev, {
              ...message.payload,
              reactions: message.payload.reactions || [],
              replyTo: message.payload.replyTo || null
            }];
          });

          const authorName = message.payload.author?.displayName || message.payload.author?.username;
          if (authorName) {
            setTypingUsers(prev => prev.filter(name => name !== authorName));
            if (typingTimeouts.current.has(authorName)) {
              clearTimeout(typingTimeouts.current.get(authorName));
              typingTimeouts.current.delete(authorName);
            }
          }
        }

        if (message.payload.author?.id === user?.id) {
          metricsRef.current.trackMessageReceived(message.payload.id, message.payload.content);
        }

        setRooms(prev => prev.map(room => 
          room.id === message.payload.roomId 
            ? { ...room, messages: [message.payload] }
            : room
        ));
        break;

      case 'MESSAGE_EDITED':
        setMessages(prev => prev.map(msg =>
          msg.id === message.payload.messageId
            ? { ...msg, content: message.payload.content, isEdited: true, editedAt: message.payload.editedAt }
            : msg
        ));
        break;

      case 'MESSAGE_DELETED':
        setMessages(prev => prev.map(msg =>
          msg.id === message.payload.messageId
            ? { ...msg, isDeleted: true, content: '' }
            : msg
        ));
        break;

      case 'MESSAGE_READ':
        setMessages(prev => prev.map(msg => {
          if (msg.id === message.payload.messageId) {
            const existingReceipts = msg.receipts || [];
            const alreadyRead = existingReceipts.some(r => r.userId === message.payload.userId);
            
            if (!alreadyRead) {
              return {
                ...msg,
                receipts: [
                  ...existingReceipts,
                  {
                    userId: message.payload.userId,
                    userName: message.payload.userName,
                    readAt: message.payload.readAt
                  }
                ]
              };
            }
          }
          return msg;
        }));
        break;

      case 'REACTION_ADDED':
      case 'REACTION_REMOVED':
        setMessages(prev => prev.map(msg =>
          msg.id === message.payload.messageId
            ? { ...msg, reactions: message.payload.reactions }
            : msg
        ));
        break;

      case 'USER_TYPING':
        if (currentRoomRef.current?.id === message.payload.roomId && message.payload.userId !== user?.id) {
          const userName = message.payload.displayName || message.payload.username;
          setTypingUsers(prev => {
            if (!prev.includes(userName)) {
              return [...prev, userName];
            }
            return prev;
          });

          if (typingTimeouts.current.has(userName)) {
            clearTimeout(typingTimeouts.current.get(userName)!);
          }

          const timeout = setTimeout(() => {
            setTypingUsers(prev => prev.filter(name => name !== userName));
            typingTimeouts.current.delete(userName);
          }, 3000);

          typingTimeouts.current.set(userName, timeout);
        }
        break;

      case 'USER_STOPPED_TYPING':
        if (currentRoomRef.current?.id === message.payload.roomId) {
          const userName = message.payload.displayName || message.payload.username;
          setTypingUsers(prev => prev.filter(name => name !== userName));
          if (typingTimeouts.current.has(userName)) {
            clearTimeout(typingTimeouts.current.get(userName)!);
            typingTimeouts.current.delete(userName);
          }
        }
        break;

      case 'ROOM_JOINED':
        console.log('📥 ROOM_JOINED event:', message.payload);
        
        if (message.payload.room) {
          setRooms(prev => {
            const exists = prev.find(r => r.id === message.payload.room.id);
            if (exists) return prev;
            return [...prev, message.payload.room];
          });
        }
        
        // Always load messages when joining room
        if (message.payload.messages) {
          console.log('📨 Loading messages:', message.payload.messages.length);
          setMessages(message.payload.messages);
          setHasMoreMessages(message.payload.messages.length >= 50);
          setIsLoadingMessages(false);
        }
        break;

      case 'MESSAGES_LOADED':
        if (message.payload.messages && currentRoomRef.current?.id === message.payload.roomId) {
          setMessages(prev => [...message.payload.messages, ...prev]);
          setHasMoreMessages(message.payload.messages.length === 50);
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

      case 'MEMBER_ADDED':
        console.log('📥 MEMBER_ADDED event:', message.payload);
        setRooms(prev => prev.map(room => 
          room.id === message.payload.roomId 
            ? { ...room, members: [...room.members, message.payload.member] }
            : room
        ));
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
        setRooms(prev => prev.map(room => {
          if (room.id === message.payload.roomId) {
            return {
              ...room,
              members: room.members.map(m => 
                m.userId === message.payload.userId
                  ? { ...m, role: 'admin' as const }
                  : m
              )
            };
          }
          return room;
        }));
        if (currentRoomRef.current?.id === message.payload.roomId) {
          setCurrentRoom(prev => prev ? {
            ...prev,
            members: prev.members.map(m => 
              m.userId === message.payload.userId
                ? { ...m, role: 'admin' as const }
                : m
            )
          } : null);
        }
        break;

      case 'REMOVED_FROM_GROUP':
      case 'LEFT_GROUP':
        setRooms(prev => prev.filter(room => room.id !== message.payload.roomId));
        if (currentRoomRef.current?.id === message.payload.roomId) {
          setCurrentRoom(null);
          setMessages([]);
        }
        break;

      default:
        console.log('Unhandled message type:', message.type);
    }
  }, [user]);

  // Select room
  const selectRoom = useCallback(async (roomId: string) => {
    if (!sseService) return;

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    setCurrentRoom(room);
    // Don't clear messages immediately - wait for ROOM_JOINED event
    setTypingUsers([]);
    setReplyingTo(null);
    setHasMoreMessages(true);
    setIsLoadingMessages(true);

    try {
      await sseService.joinRoom(roomId);
      // Messages will be set by ROOM_JOINED event handler
    } catch (error) {
      console.error('Error joining room:', error);
      setIsLoadingMessages(false);
    }
  }, [sseService, rooms]);

  // Send message
  const sendMessage = useCallback(async (content: string, replyToId?: string) => {
    if (!currentRoom || !sseService) return;

    const messageId = `temp-${Date.now()}-${Math.random()}`;
    metricsRef.current.trackMessageSent(messageId, content);

    try {
      await sseService.sendMessage(currentRoom.id, content, replyToId);
      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending message:', error);
      metricsRef.current.trackError('message_failed', 'Failed to send message');
    }
  }, [currentRoom, sseService]);

  // Edit message
  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!sseService) return;

    try {
      await sseService.editMessage(messageId, content);
    } catch (error) {
      console.error('Error editing message:', error);
    }
  }, [sseService]);

  // Delete message
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!sseService) return;

    try {
      await sseService.deleteMessage(messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }, [sseService]);

  // Add reaction
  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!sseService) return;

    try {
      await sseService.addReaction(messageId, emoji);
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }, [sseService]);

  // Remove reaction
  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!sseService) return;

    try {
      await sseService.removeReaction(messageId, emoji);
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  }, [sseService]);

  // Create private room
  const createPrivateRoom = useCallback(async (targetUserId: string) => {
    if (!sseService) return;

    try {
      const room = await sseService.createPrivateRoom(targetUserId);
      setRooms(prev => [...prev, room]);
      setCurrentRoom(room);
    } catch (error) {
      console.error('Error creating private room:', error);
    }
  }, [sseService]);

  // Create group room
  const createGroupRoom = useCallback(async (name: string, memberIds: string[]) => {
    if (!sseService) return;

    try {
      const room = await sseService.createGroupRoom(name, memberIds);
      setRooms(prev => [...prev, room]);
      setCurrentRoom(room);
    } catch (error) {
      console.error('Error creating group room:', error);
    }
  }, [sseService]);

  // Load more messages
  const loadMoreMessages = useCallback(async () => {
    if (!currentRoom || !sseService || messages.length === 0 || isLoadingMessages || !hasMoreMessages) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    setIsLoadingMessages(true);
    try {
      const olderMessages = await sseService.loadMoreMessages(
        currentRoom.id,
        oldestMessage.createdAt,
        50
      );

      if (olderMessages && olderMessages.length > 0) {
        setMessages(prev => [...olderMessages, ...prev]);
        setHasMoreMessages(olderMessages.length === 50);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [currentRoom, sseService, messages, isLoadingMessages, hasMoreMessages]);

  // Mark message as read
  const markMessageAsRead = useCallback(async (messageId: string) => {
    if (!sseService) return;

    try {
      await sseService.markAsRead(messageId);
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }, [sseService]);

  // Mark multiple messages as read
  const markMessagesAsRead = useCallback(async (messageIds: string[]) => {
    if (!sseService || messageIds.length === 0) return;

    try {
      // Mark all messages as read
      await Promise.all(messageIds.map(id => sseService.markAsRead(id)));
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [sseService]);

  // Start typing
  const startTyping = useCallback(() => {
    if (!sseService || !currentRoom) return;

    sseService.startTyping(currentRoom.id).catch(err => {
      console.error('Error starting typing:', err);
    });

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    typingTimeout.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  }, [sseService, currentRoom]);

  // Stop typing
  const stopTyping = useCallback(() => {
    if (!sseService || !currentRoom) return;

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      typingTimeout.current = null;
    }

    sseService.stopTyping(currentRoom.id).catch(err => {
      console.error('Error stopping typing:', err);
    });
  }, [sseService, currentRoom]);

  // Update group name
  const updateGroupName = useCallback(async (roomId: string, name: string) => {
    if (!sseService) return;

    try {
      await sseService.updateGroupName(roomId, name);
    } catch (error) {
      console.error('Error updating group name:', error);
    }
  }, [sseService]);

  // Remove member
  const removeMember = useCallback(async (roomId: string, userId: string) => {
    if (!sseService) return;

    try {
      await sseService.removeMember(roomId, userId);
    } catch (error) {
      console.error('Error removing member:', error);
    }
  }, [sseService]);

  // Promote to admin
  const promoteToAdmin = useCallback(async (roomId: string, userId: string) => {
    if (!sseService) return;

    try {
      await sseService.promoteToAdmin(roomId, userId);
    } catch (error) {
      console.error('Error promoting to admin:', error);
    }
  }, [sseService]);

  // Leave group
  const leaveGroup = useCallback(async (roomId: string) => {
    if (!sseService) return;

    try {
      await sseService.leaveGroup(roomId);
    } catch (error) {
      console.error('Error leaving group:', error);
    }
  }, [sseService]);

  // Add member to room
  const addMemberToRoom = useCallback(async (roomId: string, userId: string) => {
    if (!sseService) return;

    try {
      await sseService.addMemberToRoom(roomId, userId);
    } catch (error) {
      console.error('Error adding member:', error);
    }
  }, [sseService]);

  const value: ChatContextType = {
    rooms,
    currentRoom,
    messages,
    typingUsers,
    connectionStatus,
    latency,
    replyingTo,
    hasMoreMessages,
    isLoadingMessages,
    metrics: metricsRef.current,
    selectRoom,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    createPrivateRoom,
    createGroupRoom,
    loadMoreMessages,
    markMessageAsRead,
    markMessagesAsRead,
    startTyping,
    stopTyping,
    updateGroupName,
    removeMember,
    promoteToAdmin,
    leaveGroup,
    addMemberToRoom,
    setReplyingTo
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
