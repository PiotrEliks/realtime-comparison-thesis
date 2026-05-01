import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@realtime-thesis/shared-ui/src/contexts/AuthContext';
import { WebRTCService, Room, Message } from '../services/WebRTCService';
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
  
  const [webrtcService, setWebrtcService] = useState<WebRTCService | null>(null);
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
      setWebrtcService(null);
      setConnectionStatus('disconnected');
      return;
    }

    const rtc = new WebRTCService(token);
    setWebrtcService(rtc);

    rtc.onStatusChange((status) => {
      setConnectionStatus(status);
      if (status === 'disconnected') {
        metricsRef.current.trackDisconnect();
      } else if (status === 'connected') {
        metricsRef.current.trackReconnect();
      }
    });

    rtc.onMessage((message) => {
      handleWebRTCMessage(message);
    });

    rtc.connect().catch((error) => {
      console.error('Failed to connect WebRTC:', error);
      setConnectionStatus('error');
    });

    return () => {
      rtc.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!webrtcService) return;

    const interval = setInterval(() => {
      setLatency(webrtcService.getLatency());
    }, 1000);

    return () => clearInterval(interval);
  }, [webrtcService]);

  const handleWebRTCMessage = useCallback((message: { type: string; payload?: any }) => {
    console.log('📨 WebRTC Message:', message.type, message.payload || message);

    switch (message.type) {
      case 'CONNECTED':
        console.log('✅ WebRTC Connected:', message.payload);
        if (token && user) {
          fetch('http://localhost:4004/api/rooms', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
            .then(res => res.json())
            .then(data => setRooms(data.rooms))
            .catch(err => console.error('Error loading rooms:', err));
        }
        break;

      case 'NEW_MESSAGE':
        const msgPayload = message.payload || message;
        
        if (currentRoomRef.current && msgPayload.roomId === currentRoomRef.current.id) {
          setMessages(prev => {
            // Check if message already exists
            if (prev.some(m => m.id === msgPayload.id || (m.content === msgPayload.content && m.timestamp === msgPayload.timestamp))) {
              return prev;
            }
            
            // Create full message object with author
            const fullMessage: Message = {
              id: msgPayload.id || `temp-${msgPayload.timestamp}`,
              roomId: msgPayload.roomId,
              userId: msgPayload.userId || user?.id || '',
              content: msgPayload.content,
              type: msgPayload.type || 'text',
              createdAt: msgPayload.createdAt || new Date(msgPayload.timestamp || Date.now()),
              author: msgPayload.author || {
                id: msgPayload.userId || user?.id || '',
                username: msgPayload.username || user?.username || 'Unknown',
                displayName: msgPayload.displayName || user?.displayName,
                email: '',
                createdAt: new Date(),
                updatedAt: new Date()
              },
              reactions: msgPayload.reactions || [],
              replyTo: msgPayload.replyTo || null,
              receipts: msgPayload.receipts || []
            };
            
            return [...prev, fullMessage];
          });

          const authorName = msgPayload.author?.displayName || msgPayload.author?.username || msgPayload.displayName || msgPayload.username;
          if (authorName) {
            setTypingUsers(prev => prev.filter(name => name !== authorName));
            if (typingTimeouts.current.has(authorName)) {
              clearTimeout(typingTimeouts.current.get(authorName));
              typingTimeouts.current.delete(authorName);
            }
          }
        }

        if (msgPayload.userId === user?.id || msgPayload.author?.id === user?.id) {
          metricsRef.current.trackMessageReceived(msgPayload.id || 'temp', msgPayload.content);
        }
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

      case 'user-typing': {
        // SignalingServer sends these fields directly, not in payload!
        const typingData = message as any;
        const typingRoomId = typingData.roomId || message.payload?.roomId;
        const typingUserId = typingData.userId || message.payload?.userId;
        const typingUserName = typingData.displayName || typingData.username || message.payload?.displayName || message.payload?.username;
        
        if (currentRoomRef.current?.id === typingRoomId && typingUserId !== user?.id && typingUserName) {
          setTypingUsers(prev => {
            if (!prev.includes(typingUserName)) return [...prev, typingUserName];
            return prev;
          });

          if (typingTimeouts.current.has(typingUserName)) {
            clearTimeout(typingTimeouts.current.get(typingUserName)!);
          }

          const timeout = setTimeout(() => {
            setTypingUsers(prev => prev.filter(name => name !== typingUserName));
            typingTimeouts.current.delete(typingUserName);
          }, 3000);

          typingTimeouts.current.set(typingUserName, timeout);
        }
        break;
      }

      case 'user-stopped-typing': {
        const typingData = message as any;
        const typingRoomId = typingData.roomId || message.payload?.roomId;
        const typingUserName = typingData.displayName || typingData.username || message.payload?.displayName || message.payload?.username;
        
        if (currentRoomRef.current?.id === typingRoomId && typingUserName) {
          setTypingUsers(prev => prev.filter(name => name !== typingUserName));
          if (typingTimeouts.current.has(typingUserName)) {
            clearTimeout(typingTimeouts.current.get(typingUserName)!);
            typingTimeouts.current.delete(typingUserName);
          }
        }
        break;
      }

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

      default:
        console.log('Unhandled WebRTC message type:', message.type);
    }
  }, [user, token]);

  const selectRoom = useCallback(async (roomId: string) => {
    if (!webrtcService) return;

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    setCurrentRoom(room);
    setTypingUsers([]);
    setReplyingTo(null);
    setHasMoreMessages(true);
    setIsLoadingMessages(true);

    try {
      await webrtcService.joinRoom(roomId);
    } catch (error) {
      console.error('Error joining room:', error);
      setIsLoadingMessages(false);
    }
  }, [webrtcService, rooms]);

  const sendMessage = useCallback(async (content: string, replyToId?: string) => {
    if (!currentRoom || !webrtcService) return;

    const messageId = `temp-${Date.now()}-${Math.random()}`;
    metricsRef.current.trackMessageSent(messageId, content);

    try {
      await webrtcService.sendMessage(currentRoom.id, content, replyToId);
      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending message:', error);
      metricsRef.current.trackError('message_failed', 'Failed to send message');
    }
  }, [currentRoom, webrtcService]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.editMessage(messageId, content);
    } catch (error) {
      console.error('Error editing message:', error);
    }
  }, [webrtcService]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.deleteMessage(messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }, [webrtcService]);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.addReaction(messageId, emoji);
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }, [webrtcService]);

  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.removeReaction(messageId, emoji);
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  }, [webrtcService]);

  const createPrivateRoom = useCallback(async (targetUserId: string) => {
    if (!webrtcService) return;
    try {
      const room = await webrtcService.createPrivateRoom(targetUserId);
      setRooms(prev => [...prev, room]);
      setCurrentRoom(room);
    } catch (error) {
      console.error('Error creating private room:', error);
    }
  }, [webrtcService]);

  const createGroupRoom = useCallback(async (name: string, memberIds: string[]) => {
    if (!webrtcService) return;
    try {
      const room = await webrtcService.createGroupRoom(name, memberIds);
      setRooms(prev => [...prev, room]);
      setCurrentRoom(room);
    } catch (error) {
      console.error('Error creating group room:', error);
    }
  }, [webrtcService]);

  const loadMoreMessages = useCallback(async () => {
    if (!currentRoom || !webrtcService || messages.length === 0 || isLoadingMessages || !hasMoreMessages) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    setIsLoadingMessages(true);
    try {
      const olderMessages = await webrtcService.loadMoreMessages(
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
  }, [currentRoom, webrtcService, messages, isLoadingMessages, hasMoreMessages]);

  const markMessageAsRead = useCallback(async (messageId: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.markAsRead(messageId);
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }, [webrtcService]);

  const markMessagesAsRead = useCallback(async (messageIds: string[]) => {
    if (!webrtcService || messageIds.length === 0) return;
    try {
      await Promise.all(messageIds.map(id => webrtcService.markAsRead(id)));
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [webrtcService]);

  const startTyping = useCallback(() => {
    if (!webrtcService || !currentRoom) return;

    webrtcService.startTyping(currentRoom.id).catch(err => {
      console.error('Error starting typing:', err);
    });

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    typingTimeout.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  }, [webrtcService, currentRoom]);

  const stopTyping = useCallback(() => {
    if (!webrtcService || !currentRoom) return;

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      typingTimeout.current = null;
    }

    webrtcService.stopTyping(currentRoom.id).catch(err => {
      console.error('Error stopping typing:', err);
    });
  }, [webrtcService, currentRoom]);

  const updateGroupName = useCallback(async (roomId: string, name: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.updateGroupName(roomId, name);
    } catch (error) {
      console.error('Error updating group name:', error);
    }
  }, [webrtcService]);

  const removeMember = useCallback(async (roomId: string, userId: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.removeMember(roomId, userId);
    } catch (error) {
      console.error('Error removing member:', error);
    }
  }, [webrtcService]);

  const promoteToAdmin = useCallback(async (roomId: string, userId: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.promoteToAdmin(roomId, userId);
    } catch (error) {
      console.error('Error promoting to admin:', error);
    }
  }, [webrtcService]);

  const leaveGroup = useCallback(async (roomId: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.leaveGroup(roomId);
    } catch (error) {
      console.error('Error leaving group:', error);
    }
  }, [webrtcService]);

  const addMemberToRoom = useCallback(async (roomId: string, userId: string) => {
    if (!webrtcService) return;
    try {
      await webrtcService.addMemberToRoom(roomId, userId);
    } catch (error) {
      console.error('Error adding member:', error);
    }
  }, [webrtcService]);

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