// src/components/Board/BoardSettings.tsx - COMPLETE FIXED VERSION

import { useState, useEffect } from 'react';
import { apiService } from '../../services/ApiService';
import { useWhiteboardStore } from '../../store/useWhiteboardStore';
import type { User } from '../../types';

interface BoardSettingsProps {
  onClose: () => void;
  boardId: string;
}

interface Member {
  id: string;
  username: string;
  displayName?: string;
  role: 'owner' | 'editor' | 'viewer';
  cursorColor: string;
}

export default function BoardSettings({ onClose, boardId }: BoardSettingsProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'members'>('general');
  const [boardName, setBoardName] = useState('');
  const [boardDescription, setBoardDescription] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'editor' | 'viewer'>('editor');
  
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const user = useWhiteboardStore(state => state.user);
  const currentBoard = useWhiteboardStore(state => state.currentBoard);
  const setCurrentBoard = useWhiteboardStore(state => state.setCurrentBoard);

  useEffect(() => {
    if (currentBoard) {
      setBoardName(currentBoard.name);
      setBoardDescription(currentBoard.description || '');
    }
    loadMembers();
  }, [currentBoard]);

  // Load available users when members change
  useEffect(() => {
    if (members.length > 0) {
      loadAvailableUsers();
    }
  }, [members.length]);

  const loadMembers = async () => {
    try {
      const { members: memberList } = await apiService.getBoardMembers(boardId);
      setMembers(memberList);
    } catch (err: any) {
      console.error('Error loading members:', err);
    }
  };

  const loadAvailableUsers = async () => {
    setLoadingUsers(true);
    try {
      const { users } = await apiService.getAllUsers();
      
      const memberIds = new Set(members.map(m => m.id));
      const available = users.filter(u => !memberIds.has(u.id) && u.id !== user?.id);
      
      setAvailableUsers(available);
    } catch (err: any) {
      console.error('Error loading users:', err);
      setError('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleUpdateBoard = async () => {
    if (!boardName.trim()) {
      setError('Board name is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { board } = await apiService.updateBoard(boardId, user!.id, {
        name: boardName,
        description: boardDescription
      });

      setCurrentBoard(board);
      setSuccess('Board updated successfully!');
      
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) {
      setError('Please select a user');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await apiService.addBoardMember(
        boardId,
        user!.id,
        selectedUserId,
        newMemberRole
      );

      const addedUser = availableUsers.find(u => u.id === selectedUserId);
      setSuccess(`User ${addedUser?.username || 'unknown'} added successfully!`);
      setSelectedUserId('');
      
      await loadMembers();

      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIXED: Accept whole member object
  const handleRemoveMember = async (member: Member) => {
    if (!window.confirm(`Remove ${member.username} from board?`)) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('🗑️ Removing member:', member.id, member.username);
      
      await apiService.removeBoardMember(boardId, user!.id, member.id);
      
      setSuccess(`User ${member.username} removed`);
      
      await loadMembers();

      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      console.error('❌ Remove member error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBoard = async () => {
    if (!window.confirm('Delete this board? This CANNOT be undone!')) {
      return;
    }

    if (!window.confirm('Are you ABSOLUTELY sure? All drawings will be lost forever!')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await apiService.deleteBoard(boardId, user!.id);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const isOwner = currentBoard?.role === 'owner';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-2xl font-bold">Board Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="px-6 border-b flex gap-4">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 px-4 border-b-2 transition-colors ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`py-3 px-4 border-b-2 transition-colors ${
              activeTab === 'members'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Members ({members.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
              {success}
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Board Name
                </label>
                <input
                  type="text"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!isOwner}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={boardDescription}
                  onChange={(e) => setBoardDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                  disabled={!isOwner}
                />
              </div>

              {isOwner && (
                <button
                  onClick={handleUpdateBoard}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              )}

              {isOwner && (
                <div className="border-t pt-6 mt-6">
                  <h3 className="text-lg font-semibold text-red-600 mb-3">
                    Danger Zone
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Once you delete a board, there is no going back.
                  </p>
                  <button
                    onClick={handleDeleteBoard}
                    disabled={loading}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    Delete Board
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-6">
              {isOwner && (
                <div className="border rounded p-4 bg-gray-50">
                  <h3 className="text-sm font-semibold mb-3">Add Member</h3>
                  
                  {loadingUsers ? (
                    <div className="text-center py-4">Loading users...</div>
                  ) : availableUsers.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      No users available to add
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a user...</option>
                        {availableUsers.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.displayName || u.username} (@{u.username})
                          </option>
                        ))}
                      </select>

                      <select
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value as 'editor' | 'viewer')}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="editor">Editor (can draw)</option>
                        <option value="viewer">Viewer (read-only)</option>
                      </select>

                      <button
                        onClick={handleAddMember}
                        disabled={loading || !selectedUserId}
                        className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                      >
                        Add Member
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold mb-3">Current Members</h3>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: member.cursorColor }}
                        />
                        <div>
                          <div className="font-medium">
                            {member.displayName || member.username}
                          </div>
                          <div className="text-sm text-gray-500">
                            {member.role === 'owner' && '👑 Owner'}
                            {member.role === 'editor' && '✏️ Editor'}
                            {member.role === 'viewer' && '👁️ Viewer'}
                          </div>
                        </div>
                      </div>

                      {/* ✅ FIXED: Pass whole member object */}
                      {isOwner && member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member)}
                          className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}