import React, { useState, useEffect } from 'react';
import { X, Search, Users, MessageSquare, Loader2, Check } from 'lucide-react';
import { useAuth } from '@realtime-thesis/shared-ui/src/contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';

interface User {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  status: string;
}

interface CreateChatModalProps {
  onClose: () => void;
}

export const CreateChatModal: React.FC<CreateChatModalProps> = ({ onClose }) => {
  const { token } = useAuth();
  const { createPrivateRoom, createGroupRoom } = useChat();
  
  const [mode, setMode] = useState<'private' | 'group'>('private');
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const API_URL = 'http://localhost:4001/api';

  // Load all users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Filter users based on search
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers(allUsers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(
        allUsers.filter(user => 
          user.username.toLowerCase().includes(query) ||
          user.displayName?.toLowerCase().includes(query) ||
          user.username.toLowerCase().startsWith(query)
        )
      );
    }
  }, [searchQuery, allUsers]);

  const loadUsers = async () => {
    if (!token) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAllUsers(data.users);
        setFilteredUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserSelection = (user: User) => {
    if (mode === 'private') {
      setSelectedUsers([user]);
    } else {
      setSelectedUsers(prev => {
        const exists = prev.find(u => u.id === user.id);
        if (exists) {
          return prev.filter(u => u.id !== user.id);
        }
        return [...prev, user];
      });
    }
  };

  const handleCreate = async () => {
    if (selectedUsers.length === 0) return;

    setIsCreating(true);
    try {
      if (mode === 'private') {
        await createPrivateRoom(selectedUsers[0].id);
      } else {
        if (!groupName.trim()) {
          alert('Please enter a group name');
          setIsCreating(false);
          return;
        }
        await createGroupRoom(
          groupName.trim(),
          selectedUsers.map(u => u.id)
        );
      }
      onClose();
    } catch (error) {
      console.error('Failed to create chat:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-slate-800">Create New Chat</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => {
                setMode('private');
                setSelectedUsers([]);
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                mode === 'private'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4 inline mr-2" />
              Private Chat
            </button>
            <button
              onClick={() => {
                setMode('group');
                setSelectedUsers([]);
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                mode === 'group'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Group Chat
            </button>
          </div>
        </div>

        {/* Group Name Input (only for groups) */}
        {mode === 'group' && (
          <div className="px-6 pt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name..."
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Search */}
        <div className="px-6 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Selected Users (for group) */}
        {mode === 'group' && selectedUsers.length > 0 && (
          <div className="px-6 pt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">
              Selected ({selectedUsers.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map(user => (
                <div
                  key={user.id}
                  className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
                >
                  <span>{user.displayName || user.username}</span>
                  <button
                    onClick={() => toggleUserSelection(user)}
                    className="hover:bg-blue-100 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No users found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map(user => {
                const isSelected = selectedUsers.some(u => u.id === user.id);
                
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleUserSelection(user)}
                    className={`w-full p-3 rounded-lg transition-all text-left ${
                      isSelected
                        ? 'bg-blue-50 border-2 border-blue-200'
                        : 'hover:bg-slate-50 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-medium">
                          {(user.displayName || user.username).charAt(0).toUpperCase()}
                        </div>
                        {user.status === 'online' && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800 truncate">
                            {user.displayName || user.username}
                          </p>
                          {isSelected && (
                            <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-slate-500">@{user.username}</p>
                      </div>

                      {user.status === 'online' && (
                        <span className="text-xs text-green-600 font-medium">Online</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-medium text-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={selectedUsers.length === 0 || isCreating || (mode === 'group' && !groupName.trim())}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Create {mode === 'private' ? 'Chat' : 'Group'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};