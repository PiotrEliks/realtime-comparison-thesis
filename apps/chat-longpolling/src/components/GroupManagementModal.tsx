import React, { useState, useEffect } from 'react';
import { X, UserPlus, UserMinus, Crown, LogOut, Edit2, Check, Search } from 'lucide-react';
import { useAuth } from '@realtime-thesis/shared-ui/src/contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';

interface GroupManagementModalProps {
  room: any;
  onClose: () => void;
}

export const GroupManagementModal: React.FC<GroupManagementModalProps> = ({ room, onClose }) => {
  const { user } = useAuth();
  const { updateGroupName, removeMember, promoteToAdmin, leaveGroup, addMemberToRoom } = useChat();
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(room.name || '');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const currentUserMember = room.members?.find((m: any) => m?.user?.id === user?.id);
  const isAdmin = currentUserMember?.role === 'admin';

  useEffect(() => {
    if (showAddMemberModal) {
      fetchAvailableUsers();
    }
  }, [showAddMemberModal]);

  const fetchAvailableUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const token = localStorage.getItem('chat_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4003/api';
      
      const response = await fetch(`${API_URL}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        // Filtruj użytkowników już w pokoju
        const currentMemberIds = room.members?.map((m: any) => m?.user?.id) || [];
        const available = data.users.filter((u: any) => !currentMemberIds.includes(u.id));
        setAvailableUsers(available);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleSaveName = () => {
    if (newName.trim()) {
      updateGroupName(room.id, newName.trim());
      setIsEditingName(false);
    }
  };

  const handleRemoveMember = (memberId: string) => {
    if (confirm('Remove this member from the group?')) {
      removeMember(room.id, memberId);
    }
  };

  const handlePromote = (memberId: string) => {
    if (confirm('Promote this member to admin?')) {
      promoteToAdmin(room.id, memberId);
    }
  };

  const handleLeave = () => {
    if (confirm('Are you sure you want to leave this group?')) {
      leaveGroup(room.id);
      onClose();
    }
  };

  const handleAddMember = (userId: string) => {
    addMemberToRoom(room.id, userId);
    setShowAddMemberModal(false);
    setSearchQuery('');
  };

  const filteredUsers = availableUsers.filter(u => 
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
          
          {/* Header */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-800">Group Settings</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Group Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Group Name
              </label>
              {isEditingName ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSaveName()}
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingName(false);
                      setNewName(room.name || '');
                    }}
                    className="px-4 py-2 bg-slate-200 rounded-lg hover:bg-slate-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-slate-800">{room.name || 'Unnamed Group'}</p>
                  {isAdmin && (
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="p-2 hover:bg-slate-100 rounded-lg"
                    >
                      <Edit2 className="w-4 h-4 text-slate-600" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Members */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-800">
                  Members ({room.members?.length || 0})
                </h3>
                {isAdmin && (
                  <button 
                    onClick={() => setShowAddMemberModal(true)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add Member
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {room.members?.map((member: any) => {
                  const memberRole = member?.role;
                  const isCurrentUser = member?.user?.id === user?.id;
                  console.log('Rendering member:', member);
                  
                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-medium">
                          {(member?.user?.displayName || member?.user?.username).charAt(0).toUpperCase()}
                        </div>
                        {member.status === 'online' && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800 truncate">
                            {member?.user?.displayName || member?.user?.username}
                            {isCurrentUser && <span className="text-blue-600 ml-1">(you)</span>}
                          </p>
                          {memberRole === 'admin' && (
                            <Crown className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                        <p className="text-sm text-slate-500">@{member?.user?.username}</p>
                      </div>

                      {/* Actions */}
                      {isAdmin && !isCurrentUser && (
                        <div className="flex gap-1">
                          {memberRole !== 'admin' && (
                            <button
                              onClick={() => handlePromote(member?.user?.id)}
                              className="p-2 hover:bg-blue-50 rounded-lg text-blue-600"
                              title="Promote to admin"
                            >
                              <Crown className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveMember(member?.user?.id)}
                            className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                            title="Remove member"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-200 flex gap-3">
            <button
              onClick={handleLeave}
              className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Leave Group
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[600px] flex flex-col shadow-2xl">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-slate-800">Add Member</h3>
                <button onClick={() => setShowAddMemberModal(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingUsers ? (
                <div className="text-center py-8 text-slate-500">Loading users...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  {searchQuery ? 'No users found' : 'All users are already members'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer"
                      onClick={() => handleAddMember(u.id)}
                    >
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-medium">
                        {(u.displayName || u.username).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">
                          {u.displayName || u.username}
                        </p>
                        <p className="text-sm text-slate-500">@{u.username}</p>
                      </div>
                      <UserPlus className="w-5 h-5 text-blue-600" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};