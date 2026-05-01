import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Users, Wifi, WifiOff, Clock, MessageSquare, User } from 'lucide-react';

// Typy wiadomości
interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  type: 'user' | 'system';
}

interface ChatUser {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen?: number;
}

interface ChatInterfaceProps {
  currentUserId?: string;
  currentUserName?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  currentUserId = `user-${Math.random().toString(36).substr(2, 9)}`,
  currentUserName = 'Anonymous'
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([
    { id: currentUserId, name: currentUserName, status: 'online' }
  ]);
  const [inputText, setInputText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [latency, setLatency] = useState(0);
  const [isTyping, setIsTyping] = useState<string[]>([]);
  const [showUserList, setShowUserList] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ref do funkcji komunikacji - będzie implementowany dla każdej technologii
  const communicationRef = useRef({
    sendMessage: (message: any) => {
      console.log('Default sendMessage:', message);
      // Ta funkcja zostanie nadpisana przez adapter komunikacyjny
    }
  });

  // Auto-scroll do najnowszej wiadomości
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Hook do inicjalizacji komunikacji - tu podłączysz konkretną technologię
  useEffect(() => {
    // TUTAJ BĘDZIE PODŁĄCZENIE KONKRETNEJ TECHNOLOGII:
    // const adapter = new WebSocketAdapter({
    //   onMessage: handleIncomingMessage,
    //   onStatusChange: setConnectionStatus,
    //   onLatencyUpdate: setLatency
    // });
    // communicationRef.current = adapter;
    
    setConnectionStatus('connected');

    // Symulacja wiadomości powitalnej
    const welcomeMessage: Message = {
      id: `msg-${Date.now()}`,
      userId: 'system',
      userName: 'System',
      text: `Welcome to the chat, ${currentUserName}!`,
      timestamp: Date.now(),
      type: 'system'
    };
    setMessages([welcomeMessage]);

    return () => {
      // Cleanup - rozłączenie
    };
  }, [currentUserName]);

  // Handler dla wiadomości przychodzących z serwera
  const handleIncomingMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'MESSAGE':
        setMessages(prev => [...prev, message.payload]);
        break;
        
      case 'USER_JOINED':
        setUsers(prev => [...prev, message.payload.user]);
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          userId: 'system',
          userName: 'System',
          text: `${message.payload.user.name} joined the chat`,
          timestamp: Date.now(),
          type: 'system'
        }]);
        break;
        
      case 'USER_LEFT':
        setUsers(prev => prev.filter(u => u.id !== message.payload.userId));
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          userId: 'system',
          userName: 'System',
          text: `${message.payload.userName} left the chat`,
          timestamp: Date.now(),
          type: 'system'
        }]);
        break;
        
      case 'USER_TYPING':
        if (message.payload.userId !== currentUserId) {
          setIsTyping(prev => {
            if (!prev.includes(message.payload.userName)) {
              return [...prev, message.payload.userName];
            }
            return prev;
          });
          
          // Usuń "typing" po 3 sekundach
          setTimeout(() => {
            setIsTyping(prev => prev.filter(name => name !== message.payload.userName));
          }, 3000);
        }
        break;
        
      case 'USERS_LIST':
        setUsers(message.payload.users);
        break;

      case 'FULL_STATE':
        setMessages(message.payload.messages || []);
        setUsers(message.payload.users || []);
        break;
    }
  }, [currentUserId]);

  // Wysyłanie wiadomości
  const handleSendMessage = useCallback(() => {
    if (!inputText.trim()) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: currentUserId,
      userName: currentUserName,
      text: inputText.trim(),
      timestamp: Date.now(),
      type: 'user'
    };

    // Optymistyczna aktualizacja UI
    setMessages(prev => [...prev, newMessage]);

    // Wysłanie do serwera
    communicationRef.current.sendMessage({
      type: 'SEND_MESSAGE',
      payload: newMessage
    });

    setInputText('');
    inputRef.current?.focus();
  }, [inputText, currentUserId, currentUserName]);

  // Obsługa klawisza Enter
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  // Obsługa pisania (typing indicator)
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    // Wyślij informację o pisaniu
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    communicationRef.current.sendMessage({
      type: 'USER_TYPING',
      payload: { userId: currentUserId, userName: currentUserName }
    });

    typingTimeoutRef.current = setTimeout(() => {
      communicationRef.current.sendMessage({
        type: 'USER_STOPPED_TYPING',
        payload: { userId: currentUserId }
      });
    }, 1000);
  }, [currentUserId, currentUserName]);

  // Formatowanie czasu
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Formatowanie względnego czasu
  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
        
        {/* Header */}
        <div className="bg-white rounded-t-lg shadow-sm p-4 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Real-time Chat</h1>
              <p className="text-xs text-slate-500">
                {users.filter(u => u.status === 'online').length} online
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Status połączenia */}
            <div className="flex items-center gap-2">
              {connectionStatus === 'connected' ? (
                <Wifi className="w-5 h-5 text-green-500" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-500" />
              )}
              <span className="text-sm font-medium text-slate-700 hidden sm:inline">
                {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* Latencja */}
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-500" />
              <span className="text-sm font-medium text-slate-700">{latency}ms</span>
            </div>

            {/* Toggle User List */}
            <button
              onClick={() => setShowUserList(!showUserList)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Users className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:inline">
                {showUserList ? 'Hide' : 'Show'} Users
              </span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex bg-white rounded-b-lg shadow-sm overflow-hidden">
          
          {/* Messages Area */}
          <div className="flex-1 flex flex-col min-w-0">
            
            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.type === 'system' 
                      ? 'justify-center' 
                      : message.userId === currentUserId 
                        ? 'justify-end' 
                        : 'justify-start'
                  }`}
                >
                  {message.type === 'system' ? (
                    <div className="text-xs text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                      {message.text}
                    </div>
                  ) : (
                    <>
                      {message.userId !== currentUserId && (
                        <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {message.userName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      
                      <div className={`flex flex-col max-w-[70%] ${
                        message.userId === currentUserId ? 'items-end' : 'items-start'
                      }`}>
                        {message.userId !== currentUserId && (
                          <span className="text-xs font-medium text-slate-600 mb-1 px-1">
                            {message.userName}
                          </span>
                        )}
                        <div className={`rounded-2xl px-4 py-2 ${
                          message.userId === currentUserId
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-br-none'
                            : 'bg-slate-100 text-slate-800 rounded-bl-none'
                        }`}>
                          <p className="text-sm leading-relaxed break-words">{message.text}</p>
                        </div>
                        <span className="text-xs text-slate-400 mt-1 px-1">
                          {formatTime(message.timestamp)}
                        </span>
                      </div>

                      {message.userId === currentUserId && (
                        <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {message.userName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* Typing Indicator */}
              {isTyping.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-slate-500 ml-11">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span>
                    {isTyping.join(', ')} {isTyping.length === 1 ? 'is' : 'are'} typing...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-slate-200 p-4 bg-slate-50">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  disabled={connectionStatus !== 'connected'}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputText.trim() || connectionStatus !== 'connected'}
                  className="px-6 py-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </div>

          {/* User List Sidebar */}
          {showUserList && (
            <div className="w-64 border-l border-slate-200 bg-slate-50 p-4 overflow-y-auto">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Online Users ({users.filter(u => u.status === 'online').length})
              </h3>
              <div className="space-y-2">
                {users
                  .filter(u => u.status === 'online')
                  .map(user => (
                    <div
                      key={user.id}
                      className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                        user.id === currentUserId 
                          ? 'bg-blue-100' 
                          : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className="relative">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">
                          {user.name}
                          {user.id === currentUserId && (
                            <span className="text-blue-600 ml-1">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">Online</p>
                      </div>
                    </div>
                  ))}
              </div>

              {users.filter(u => u.status === 'offline').length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-slate-700 mt-6 mb-3">
                    Offline ({users.filter(u => u.status === 'offline').length})
                  </h3>
                  <div className="space-y-2">
                    {users
                      .filter(u => u.status === 'offline')
                      .map(user => (
                        <div
                          key={user.id}
                          className="flex items-center gap-3 p-2 rounded-lg opacity-60"
                        >
                          <div className="relative">
                            <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center text-slate-600 text-xs font-medium">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-slate-400 border-2 border-white rounded-full"></div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-600 truncate">
                              {user.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {user.lastSeen && formatRelativeTime(user.lastSeen)}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;