import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, MoreVertical, Edit2, Trash2, Check, CheckCheck, Users, Loader2, Image as ImageIcon, Reply, X } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { useAuth } from '@realtime-thesis/shared-ui/src/contexts/AuthContext';
import { GroupManagementModal } from './GroupManagementModal';

// Emoji picker component
const EmojiPicker: React.FC<{ 
  onSelect: (emoji: string) => void; 
  onClose: () => void;
  position?: 'top' | 'bottom';
  isOwn: boolean;
}> = ({ onSelect, onClose, position = 'top', isOwn }) => {
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥'];
  
  return (
    <div 
      className={`absolute ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} ${isOwn ? 'right-0' : 'left-0'} bg-white rounded-lg shadow-xl border border-slate-200 p-2 flex gap-1 z-50`}
      onClick={(e) => e.stopPropagation()}
    >
      {emojis.map(emoji => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="hover:bg-slate-100 rounded p-2 text-xl transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};

export const ChatInterface: React.FC = () => {
  const { user } = useAuth();
  const { 
    currentRoom, 
    messages, 
    typingUsers, 
    sendMessage, 
    editMessage, 
    deleteMessage, 
    markMessagesAsRead,
    addReaction,        // NOWE
    removeReaction,     // NOWE
    startTyping, 
    stopTyping,
    loadMoreMessages,
    hasMoreMessages,
    isLoadingMessages
  } = useChat();
  
  const [inputText, setInputText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);  // NOWE
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);  // NOWE
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [contextMenuMessageId, setContextMenuMessageId] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

   const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isAtTop = element.scrollTop === 0;
    
    if (isAtTop && hasMoreMessages && !isLoadingMessages) {
      loadMoreMessages();
    }

    const isAtBottom = element.scrollHeight - element.scrollTop === element.clientHeight;
    setUserScrolled(!isAtBottom);
  };

  const uploadImage = async (file: File) => {
    if (!currentRoom) return;

    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('chat_token');
      
      const response = await fetch('http://localhost:4003/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();
      console.log('✅ Upload successful:', data.fileUrl);
      
      sendMessage(`[IMAGE]${data.fileUrl}`, replyingTo?.id);  // DODANO replyToId
      setReplyingTo(null);  // CLEAR po wysłaniu

    } catch (error: any) {
      console.error('❌ Upload failed:', error);
      alert(`Failed to upload image: ${error.message}`);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const renderMessageContent = (message: any) => {
    const content = message.content;

    if (content.startsWith('[IMAGE]')) {
      const imageUrl = content.substring(7);
      
      return (
        <div className="relative max-w-sm">
          <img 
            src={imageUrl}
            alt="Shared image"
            className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
            style={{ maxHeight: '300px', objectFit: 'contain' }}
            onClick={() => window.open(imageUrl, '_blank')}
            onError={(e) => {
              console.error('Failed to load image:', imageUrl);
              e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="%23ddd"/><text x="50%" y="50%" font-size="14" text-anchor="middle" fill="%23999">Image not found</text></svg>';
            }}
          />
          <div className="mt-1 text-xs opacity-70">
            Click to view full size
          </div>
        </div>
      );
    }

    return (
      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
        {content}
      </p>
    );
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be smaller than 5MB');
        return;
      }

      uploadImage(file);
    }
  };

   useEffect(() => {
    if (!userScrolled) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, userScrolled]);

  useEffect(() => {
    if (!currentRoom || !user) return;

    const unreadMessageIds = messages
      .filter(msg => 
        msg.author.id !== user.id && 
        !msg.receipts?.some(r => r.userId === user.id)
      )
      .map(msg => msg.id);

    if (unreadMessageIds.length > 0) {
      markMessagesAsRead(unreadMessageIds);
    }
  }, [messages, currentRoom, user, markMessagesAsRead]);

  useEffect(() => {
    const handleClick = () => {
      setContextMenuMessageId(null);
      setShowEmojiPicker(null);  // DODANO
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleSend = () => {
    if (!inputText.trim()) return;
    
    if (editingMessageId) {
      editMessage(editingMessageId, inputText.trim());
      setEditingMessageId(null);
    } else {
      sendMessage(inputText.trim(), replyingTo?.id);  // DODANO replyToId
      setReplyingTo(null);  // CLEAR po wysłaniu
    }
    
    setInputText('');
    stopTyping();
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (e.target.value.length > 0) {
      startTyping();
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping();
      }, 1000);
    } else {
      stopTyping();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }

    if (e.key === 'Escape') {
      setEditingMessageId(null);
      setReplyingTo(null);  // DODANO
      setInputText('');
    }
  };

  const startEdit = (messageId: string, content: string) => {
    // Nie edytuj obrazków
    if (content.startsWith('[IMAGE]')) {
      return;
    }

    setEditingMessageId(messageId);
    setInputText(content);
    setContextMenuMessageId(null);
    setReplyingTo(null);  // CLEAR reply gdy edytujemy
    inputRef.current?.focus();
  };

  const handleDelete = (messageId: string) => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      deleteMessage(messageId);
      setContextMenuMessageId(null);
    }
  };

  // NOWE: Handler odpowiedzi
  const handleReply = (message: any) => {
    setReplyingTo(message);
    setContextMenuMessageId(null);
    setEditingMessageId(null);  // CLEAR edit gdy odpowiadamy
    inputRef.current?.focus();
  };

  // NOWE: Handler reakcji
  const handleReaction = (messageId: string, emoji: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    // Sprawdź czy user już zareagował tym emoji
    const hasReacted = message.reactions?.some((r: any) => 
      r.emoji === emoji && r.user?.id === user?.id
    );

    if (hasReacted) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  if (!currentRoom) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-slate-700 mb-2">No Room Selected</h2>
          <p className="text-slate-500">Select a room to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {currentRoom.type === 'group' ? (
                currentRoom.name
              ) : (
                currentRoom.members?.find((m: any) => m.userId !== user?.id)?.user?.displayName ||
                currentRoom.members?.find((m: any) => m.userId !== user?.id)?.user?.username ||
                'Private Chat'
              )}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {currentRoom.type === 'group' ? (
                <>
                  {currentRoom.members?.length || 0} members
                  {currentRoom.members && currentRoom.members.length > 0 && (
                    <span className="ml-2">
                      ({currentRoom.members.map((m: any) => 
                        m.user?.displayName || m.user?.username
                      ).join(', ')})
                    </span>
                  )}
                </>
              ) : (
                'Direct message'
              )}
            </p>
          </div>
          
          {currentRoom.type === 'group' && (
            <button
              onClick={() => setShowGroupSettings(true)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Users className="w-5 h-5 text-slate-600" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gradient-to-b from-slate-50 to-white"
      >
        {isLoadingMessages && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        )}

        {messages.map((message: any) => {
            const isOwn = message.author.id === user?.id;

            if (message.isDeleted) {
              return (
                <div
                  key={message.id}
                  className="flex gap-3 opacity-50"
                >
                  <div className="flex-1 text-sm italic text-slate-400 px-4">
                    <Trash2 className="w-3 h-3 inline mr-1" />
                    This message was deleted
                  </div>
                </div>
              );
            }

            return (
              <div
                key={message.id}
                className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'} group`}
              >
                {!isOwn && (
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                    {message.author.displayName?.charAt(0) || message.author.username.charAt(0)}
                  </div>
                )}
                
                <div className={`flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {!isOwn && currentRoom.type === 'group' && (
                    <span className="text-xs font-medium text-slate-600 mb-1 px-1">
                      {message.author.displayName || message.author.username}
                    </span>
                  )}
                  
                  {/* Message Container */}
        <div className="relative group/message w-full">
          {message.replyTo && (
            <div 
              className={`mb-2 px-3 py-2 rounded-lg border-l-4 text-xs ${
                isOwn 
                  ? 'bg-blue-50 border-blue-400' 
                  : 'bg-slate-100 border-slate-400'
              }`}
              style={{ maxWidth: '100%' }}
            >
              {/* Header z ikoną Reply */}
              <div className="flex items-center gap-1 mb-1">
                <Reply className="w-3 h-3 text-slate-500" />
                <span className="font-semibold text-slate-700">
                  {message.replyTo.author?.displayName || message.replyTo.author?.username || 'Unknown'}
                </span>
              </div>
              
              {/* Treść cytowanej wiadomości */}
              <div className="text-slate-600 truncate">
                {message.replyTo.content.startsWith('[IMAGE]') 
                  ? '📷 Image' 
                  : message.replyTo.content
                }
              </div>
              
              {/* Timestamp cytowanej wiadomości (opcjonalnie) */}
              {message.replyTo.createdAt && (
                <div className="text-xs text-slate-400 mt-1">
                  {new Date(message.replyTo.createdAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })}
                </div>
              )}
            </div>
          )}

                    {/* Message Bubble */}
                    <div className={`rounded-2xl px-4 py-2 ${
                      isOwn
                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-br-none'
                        : 'bg-white text-slate-800 rounded-bl-none shadow-sm'
                    }`}>
                      {renderMessageContent(message)}
                      
                      {message.isEdited && (
                        <span className="text-xs opacity-70 ml-2">(edited)</span>
                      )}
                    </div>

                    {/* Reactions Display - NOWE */}
                    {message.reactions && message.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 px-2">
                        {(() => {
                          // Grupuj reakcje po emoji
                          const grouped: Record<string, any[]> = {};
                          message.reactions.forEach((r: any) => {
                            if (!grouped[r.emoji]) grouped[r.emoji] = [];
                            grouped[r.emoji].push(r.user);
                          });

                          return Object.entries(grouped).map(([emoji, users]) => {
                            const hasUserReacted = users.some((u: any) => u?.id === user?.id);
                            
                            return (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(message.id, emoji)}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                                  hasUserReacted
                                    ? 'bg-blue-100 border border-blue-300'
                                    : 'bg-slate-100 border border-slate-200 hover:bg-slate-200'
                                }`}
                                title={users.map((u: any) => u?.displayName || u?.username).join(', ')}
                              >
                                <span>{emoji}</span>
                                <span className="text-slate-600">{users.length}</span>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    )}

                    {/* Menu Button */}
                    {!message.isDeleted && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenuMessageId(
                              contextMenuMessageId === message.id ? null : message.id
                            );
                          }}
                          className={`absolute top-0 ${isOwn ? '-left-8' : '-right-8'} opacity-0 group-hover/message:opacity-100 p-1.5 hover:bg-slate-200 rounded-full transition-opacity ${
                            contextMenuMessageId === message.id ? '!opacity-100 bg-slate-100' : ''
                          }`}
                        >
                          <MoreVertical className="w-4 h-4 text-slate-600" />
                        </button>

                        {/* Dropdown Menu - ZAKTUALIZOWANE */}
                        {contextMenuMessageId === message.id && (
                          <div
                            className={`absolute top-8 ${isOwn ? '-left-32' : '-right-32'} bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 min-w-[140px]`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Reply - dla wszystkich */}
                            <button
                              onClick={() => handleReply(message)}
                              className="w-full px-4 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-sm text-slate-700"
                            >
                              <Reply className="w-4 h-4" />
                              Reply
                            </button>

                            {/* React - dla wszystkich */}
                            <button
                              onClick={() => {
                                setShowEmojiPicker(message.id);
                                setContextMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-sm text-slate-700"
                            >
                              <Smile className="w-4 h-4" />
                              React
                            </button>

                            {/* Edit & Delete - tylko dla własnych */}
                            {isOwn && (
                              <>
                                <button
                                  onClick={() => startEdit(message.id, message.content)}
                                  className="w-full px-4 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-sm text-slate-700"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(message.id)}
                                  className="w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2 text-sm"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Emoji Picker - NOWE */}
                        {showEmojiPicker === message.id && (
                          <EmojiPicker
                            onSelect={(emoji) => {
                              handleReaction(message.id, emoji);
                              setShowEmojiPicker(null);
                            }}
                            onClose={() => setShowEmojiPicker(null)}
                            position="top"
                            isOwn={isOwn}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* Time and Read Receipts */}
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <span className="text-xs text-slate-400">
                      {formatTime(message.createdAt)}
                    </span>
                    
                    {isOwn && !message.isDeleted && (
                      <div className="flex items-center gap-1">
                        {message.receipts && message.receipts.length > 0 ? (
                          <>
                            <CheckCheck className="w-3 h-3 text-blue-500" />
                            <span className="text-xs text-slate-400">
                              {message.receipts.length}
                            </span>
                          </>
                        ) : (
                          <Check className="w-3 h-3 text-slate-400" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isOwn && (
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                    {user?.displayName?.charAt(0) || user?.username.charAt(0)}
                  </div>
                )}
              </div>
            );
          })
        }

        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-500 ml-11">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
            <span>
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 p-4 bg-white">
        {/* Reply Preview Bar - NOWE */}
        {replyingTo && (
          <div className="mb-2 px-3 py-2 bg-blue-50 border-l-4 border-blue-500 rounded text-sm flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-1 font-medium text-blue-700">
                <Reply className="w-3 h-3" />
                Replying to {replyingTo.author?.displayName || replyingTo.author?.username}
              </div>
              <div className="text-slate-600 truncate">
                {replyingTo.content.startsWith('[IMAGE]') 
                  ? '📷 Image' 
                  : replyingTo.content
                }
              </div>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-slate-500 hover:text-slate-700 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Edit mode indicator */}
        {editingMessageId && (
          <div className="mb-2 px-3 py-2 bg-blue-50 border-l-4 border-blue-500 rounded text-sm flex items-center justify-between">
            <div>
              <Edit2 className="w-3 h-3 inline mr-1" />
              Editing message
            </div>
            <button
              onClick={() => {
                setEditingMessageId(null);
                setInputText('');
              }}
              className="text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        )}
        
        {/* Image Upload Indicator */}
        {isUploadingImage && (
          <div className="mb-2 p-3 bg-blue-50 rounded-lg flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span className="text-sm text-blue-600">Uploading image...</span>
          </div>
        )}
        
        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          
          {/* Image button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingImage || editingMessageId !== null}
            className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Upload image"
          >
            <ImageIcon className="w-5 h-5 text-slate-600" />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder={
              editingMessageId 
                ? "Edit your message..." 
                : replyingTo 
                  ? "Type your reply..." 
                  : "Type a message..."
            }
            className="flex-1 px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="px-6 py-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        
        <p className="text-xs text-slate-400 mt-2">
          Press Enter to {editingMessageId ? 'save' : 'send'}, Esc to cancel
        </p>
      </div>

      {showGroupSettings && currentRoom.type === 'group' && (
        <GroupManagementModal
          room={currentRoom}
          onClose={() => setShowGroupSettings(false)}
        />
      )}
    </div>
  );
};