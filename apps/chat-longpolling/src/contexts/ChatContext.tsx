import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@realtime-thesis/shared-ui/src/contexts/AuthContext';
// ✅ Import KLASY jako PascalCase
import { LongPollingService as LongPollingServiceClass, Room, Message } from '../services/LongPollingService';
import { MetricsCollector } from '../services/MetricsCollector';

interface ChatContextType {
  rooms: Room[];
  currentRoom: Room | null;
  messages: Message[];
  typingUsers: string[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  latency: number;
  replyingTo: Message | null;
  hasMoreMessages: boolean;
  isLoadingMessages: boolean;
  metrics: MetricsCollector;
  selectRoom: (roomId: string) => void;
  createPrivateRoom: (targetUserId: string) => Promise<void>;
  createGroupRoom: (name: string, memberIds: string[]) => Promise<void>;
  sendMessage: (content: string, replyToId?: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  markMessageAsRead: (messageId: string) => Promise<void>;
  markMessagesAsRead: (messageIds: string[]) => Promise<void>;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  startTyping: () => void;
  stopTyping: () => void;
  updateGroupName: (roomId: string, name: string) => Promise<void>;
  removeMember: (roomId: string, userId: string) => Promise<void>;
  promoteToAdmin: (roomId: string, userId: string) => Promise<void>;
  leaveGroup: (roomId: string) => Promise<void>;
  addMemberToRoom: (roomId: string, userId: string) => Promise<void>;
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
  
  // ✅ State - MAŁA litera dla zmiennej!
  const [lpService, setLpService] = useState<LongPollingServiceClass | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [latency, setLatency] = useState<number>(0);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);

  const currentRoomRef = useRef<Room | null>(null);
  const typingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const metricsRef = useRef(new MetricsCollector());
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  useEffect(() => {
    if (!token) {
      setLpService(null);
      setConnectionStatus('disconnected');
      return;
    }

    // ✅ TUTAJ używamy KLASY (LongPollingServiceClass)
    const lp = new LongPollingServiceClass(token);
    setLpService(lp);

    lp.onStatusChange((status) => {
      setConnectionStatus(status);
      if (status === 'disconnected') {
        metricsRef.current.trackDisconnect();
      } else if (status === 'connected') {
        metricsRef.current.trackReconnect();
      }
    });

    lp.onMessage((message) => {
      handleLPMessage(message);
    });

    lp.connect().catch((error) => {
      console.error('Failed to connect Long Polling:', error);
      setConnectionStatus('error');
    });

    return () => {
      lp.disconnect();
    };
  }, [token]);

  useEffect(() => {
    // ✅ Używamy zmiennej lpService
    if (!lpService) return;

    const interval = setInterval(() => {
      setLatency(lpService.getLatency());
    }, 1000);

    return () => clearInterval(interval);
  }, [lpService]);

  const handleLPMessage = useCallback((message: { type: string; payload: any }) => {
    console.log('📨 LP Message:', message.type, message.payload);

    switch (message.type) {
      case 'CONNECTED':
        console.log('✅ LP Connected:', message.payload);
        if (message.payload.rooms) {
          setRooms(message.payload.rooms);
        }
        break;

      case 'NEW_MESSAGE':
        if (currentRoomRef.current && message.payload.roomId === currentRoomRef.current.id) {
          setMessages(prev => {
            if (prev.some(m => m.id === message.payload.id)) return prev;
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
                receipts: [...existingReceipts, {
                  userId: message.payload.userId,
                  userName: message.payload.userName,
                  readAt: message.payload.readAt
                }]
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
            if (!prev.includes(userName)) return [...prev, userName];
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
        if (message.payload.room) {
          setRooms(prev => {
            const exists = prev.find(r => r.id === message.payload.room.id);
            if (exists) return prev;
            return [...prev, message.payload.room];
          });
        }
        
        if (message.payload.messages) {
          setMessages(message.payload.messages);
          setHasMoreMessages(message.payload.messages.length >= 50);
          setIsLoadingMessages(false);
        }
        break;

      case 'GROUP_NAME_UPDATED':
        setRooms(prev => prev.map(room =>
          room.id === message.payload.roomId ? { ...room, name: message.payload.name } : room
        ));
        if (currentRoomRef.current?.id === message.payload.roomId) {
          setCurrentRoom(prev => prev ? { ...prev, name: message.payload.name } : null);
        }
        break;

      case 'MEMBER_ADDED':
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
                m.userId === message.payload.userId ? { ...m, role: 'admin' as const } : m
              )
            };
          }
          return room;
        }));
        if (currentRoomRef.current?.id === message.payload.roomId) {
          setCurrentRoom(prev => prev ? {
            ...prev,
            members: prev.members.map(m => 
              m.userId === message.payload.userId ? { ...m, role: 'admin' as const } : m
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

  const selectRoom = useCallback(async (roomId: string) => {
    if (!lpService) return;

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    setCurrentRoom(room);
    setTypingUsers([]);
    setReplyingTo(null);
    setHasMoreMessages(true);
    setIsLoadingMessages(true);

    try {
      await lpService.joinRoom(roomId);
    } catch (error) {
      console.error('Error joining room:', error);
      setIsLoadingMessages(false);
    }
  }, [lpService, rooms]);

  const sendMessage = useCallback(async (content: string, replyToId?: string) => {
    if (!currentRoom || !lpService) return;

    const messageId = `temp-${Date.now()}-${Math.random()}`;
    metricsRef.current.trackMessageSent(messageId, content);

    try {
      await lpService.sendMessage(currentRoom.id, content, replyToId);
      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending message:', error);
      metricsRef.current.trackError('message_failed', 'Failed to send message');
    }
  }, [currentRoom, lpService]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!lpService) return;
    try {
      await lpService.editMessage(messageId, content);
    } catch (error) {
      console.error('Error editing message:', error);
    }
  }, [lpService]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!lpService) return;
    try {
      await lpService.deleteMessage(messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }, [lpService]);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!lpService) return;
    try {
      await lpService.addReaction(messageId, emoji);
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }, [lpService]);

  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!lpService) return;
    try {
      await lpService.removeReaction(messageId, emoji);
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  }, [lpService]);

  const createPrivateRoom = useCallback(async (targetUserId: string) => {
    if (!lpService) return;
    try {
      const room = await lpService.createPrivateRoom(targetUserId);
      setRooms(prev => [...prev, room]);
      setCurrentRoom(room);
    } catch (error) {
      console.error('Error creating private room:', error);
    }
  }, [lpService]);

  const createGroupRoom = useCallback(async (name: string, memberIds: string[]) => {
    if (!lpService) return;
    try {
      const room = await lpService.createGroupRoom(name, memberIds);
      setRooms(prev => [...prev, room]);
      setCurrentRoom(room);
    } catch (error) {
      console.error('Error creating group room:', error);
    }
  }, [lpService]);

  const loadMoreMessages = useCallback(async () => {
    if (!currentRoom || !lpService || messages.length === 0 || isLoadingMessages || !hasMoreMessages) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    setIsLoadingMessages(true);
    try {
      const olderMessages = await lpService.loadMoreMessages(
        currentRoom.id,
        oldestMessage.createdAt.toString(),
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
  }, [currentRoom, lpService, messages, isLoadingMessages, hasMoreMessages]);

  const markMessageAsRead = useCallback(async (messageId: string) => {
    if (!lpService) return;
    try {
      await lpService.markAsRead(messageId);
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }, [lpService]);

  const markMessagesAsRead = useCallback(async (messageIds: string[]) => {
    if (!lpService || messageIds.length === 0) return;
    try {
      await Promise.all(messageIds.map(id => lpService.markAsRead(id)));
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [lpService]);

  const startTyping = useCallback(() => {
    if (!lpService || !currentRoom) return;

    lpService.startTyping(currentRoom.id).catch(err => {
      console.error('Error starting typing:', err);
    });

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    typingTimeout.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  }, [lpService, currentRoom]);

  const stopTyping = useCallback(() => {
    if (!lpService || !currentRoom) return;

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      typingTimeout.current = null;
    }

    lpService.stopTyping(currentRoom.id).catch(err => {
      console.error('Error stopping typing:', err);
    });
  }, [lpService, currentRoom]);

  const updateGroupName = useCallback(async (roomId: string, name: string) => {
    if (!lpService) return;
    try {
      await lpService.updateGroupName(roomId, name);
    } catch (error) {
      console.error('Error updating group name:', error);
    }
  }, [lpService]);

  const removeMember = useCallback(async (roomId: string, userId: string) => {
    if (!lpService) return;
    try {
      await lpService.removeMember(roomId, userId);
    } catch (error) {
      console.error('Error removing member:', error);
    }
  }, [lpService]);

  const promoteToAdmin = useCallback(async (roomId: string, userId: string) => {
    if (!lpService) return;
    try {
      await lpService.promoteToAdmin(roomId, userId);
    } catch (error) {
      console.error('Error promoting to admin:', error);
    }
  }, [lpService]);

  const leaveGroup = useCallback(async (roomId: string) => {
    if (!lpService) return;
    try {
      await lpService.leaveGroup(roomId);
    } catch (error) {
      console.error('Error leaving group:', error);
    }
  }, [lpService]);

  const addMemberToRoom = useCallback(async (roomId: string, userId: string) => {
    if (!lpService) return;
    try {
      await lpService.addMemberToRoom(roomId, userId);
    } catch (error) {
      console.error('Error adding member:', error);
    }
  }, [lpService]);

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