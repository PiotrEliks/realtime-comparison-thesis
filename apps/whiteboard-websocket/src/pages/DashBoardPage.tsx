// src/pages/DashboardPage.tsx - WITH AUTO-REFRESH

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/ApiService';
import { wsService } from '../services/WebSocketService';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import type { Board } from '../types';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  const user = useWhiteboardStore(state => state.user);
  const token = useWhiteboardStore(state => state.token);
  const setUser = useWhiteboardStore(state => state.setUser);

  useEffect(() => {
    if (!user || !token) {
      navigate('/login');
      return;
    }

    loadBoards();
    setupWebSocketListeners();

    return () => {
      // Cleanup listeners
      wsService.off('BOARD_MEMBER_ADDED', handleBoardMemberAdded);
      wsService.off('BOARD_MEMBER_REMOVED', handleBoardMemberRemoved);
    };
  }, [user, token]);

  const loadBoards = async () => {
    try {
      const { boards: boardList } = await apiService.getBoards(user!.id);
      console.log('📋 Loaded boards:', boardList.length);
      setBoards(boardList);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading boards:', err);
      setLoading(false);
    }
  };

  // ✅ NEW: Setup WebSocket listeners for board changes
  const setupWebSocketListeners = async () => {
    try {
      // Connect if not already connected
      if (!wsService.isConnected()) {
        console.log('🔌 Connecting WebSocket from Dashboard...');
        await wsService.connect(token!);
      }

      // Listen for board membership changes
      wsService.on('BOARD_MEMBER_ADDED', handleBoardMemberAdded);
      wsService.on('BOARD_MEMBER_REMOVED', handleBoardMemberRemoved);

      console.log('✅ Dashboard WebSocket listeners ready');
    } catch (error) {
      console.error('❌ Failed to setup WebSocket:', error);
    }
  };

  // ✅ NEW: Handle being added to a board
  const handleBoardMemberAdded = async (payload: any) => {
    console.log('📢 BOARD_MEMBER_ADDED on dashboard:', payload);
    
    setNotification(`You've been added to a board as ${payload.role}!`);
    
    // Auto-refresh boards list
    await loadBoards();
    
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // ✅ NEW: Handle being removed from a board
  const handleBoardMemberRemoved = async (payload: any) => {
    console.log('📢 BOARD_MEMBER_REMOVED on dashboard:', payload);
    
    setNotification('You have been removed from a board');
    
    // Auto-refresh boards list
    await loadBoards();
    
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) {
      return;
    }

    try {
      const { board } = await apiService.createBoard(
        newBoardName,
        user!.id,
        newBoardDescription
      );

      setBoards([...boards, board]);
      setShowCreateModal(false);
      setNewBoardName('');
      setNewBoardDescription('');
    } catch (err: any) {
      console.error('Error creating board:', err);
    }
  };

  const handleLogout = () => {
    wsService.disconnect();
    setUser(null, null);
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-xl">Loading boards...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ✅ Notification Banner */}
      {notification && (
        <div className="bg-blue-500 text-white px-4 py-3 text-center">
          {notification}
        </div>
      )}

      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Whiteboards</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">
              {user?.displayName || user?.username}
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">
            Boards ({boards.length})
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            + Create Board
          </button>
        </div>

        {/* Boards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boards.map(board => (
            <div
              key={board.id}
              onClick={() => navigate(`/board/${board.id}`)}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold">{board.name}</h3>
                {board.role && (
                  <span className="text-xs px-2 py-1 bg-gray-200 rounded">
                    {board.role === 'owner' && '👑 Owner'}
                    {board.role === 'editor' && '✏️ Editor'}
                    {board.role === 'viewer' && '👁️ Viewer'}
                  </span>
                )}
              </div>

              {board.description && (
                <p className="text-sm text-gray-600 mb-4">
                  {board.description}
                </p>
              )}

              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                  {board.elements?.length || 0} elements
                </span>
                <span>
                  {new Date(board.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {boards.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">No boards yet</p>
            <p className="text-sm">Create your first whiteboard to get started!</p>
          </div>
        )}
      </div>

      {/* Create Board Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Board</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Board Name
                </label>
                <input
                  type="text"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="My Whiteboard"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={newBoardDescription}
                  onChange={(e) => setNewBoardDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                  placeholder="What's this board for?"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBoard}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={!newBoardName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}