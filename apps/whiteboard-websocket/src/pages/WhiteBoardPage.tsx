// src/pages/WhiteboardPage.tsx - ZUSTAND TYPES FIXED

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { wsService } from '../services/WebSocketService';
import { apiService } from '../services/ApiService';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import BoardCanvas from '../components/Board/BoardCanvas';
import Toolbar from '../components/Board/Toolbar';
import ColorPicker from '../components/Board/ColorPicker';
import UserList from '../components/Board/UserList';
import BoardSettings from '../components/Board/BoardSettings';

export default function WhiteboardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const user = useWhiteboardStore(state => state.user);
  const token = useWhiteboardStore(state => state.token);
  const setCurrentBoard = useWhiteboardStore(state => state.setCurrentBoard);
  const setElements = useWhiteboardStore(state => state.setElements);
  const addElement = useWhiteboardStore(state => state.addElement);
  const deleteElement = useWhiteboardStore(state => state.deleteElement);
  const onlineUsers = useWhiteboardStore(state => state.onlineUsers);
  const setOnlineUsers = useWhiteboardStore(state => state.setOnlineUsers);
  const setIsConnected = useWhiteboardStore(state => state.setIsConnected);

  // ✅ CRITICAL: Define handlers with useCallback
  const handleBoardState = useCallback((payload: any) => {
    console.log('📨 BOARD_STATE received:', payload.elements?.length || 0, 'elements');
    
    if (payload.elements) {
      setElements(payload.elements);
    }
    
    if (payload.members) {
      console.log('👥 Setting online users from BOARD_STATE:', payload.members.length);
      setOnlineUsers(payload.members);
    }
  }, [setElements, setOnlineUsers]);

  const handleUserJoined = useCallback((payload: any) => {
    console.log('👤 User joined:', payload.username);
    
    const newMember = {
      userId: payload.userId,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role || 'viewer',
      cursorColor: payload.cursorColor
    };
    
    // ✅ FIX: Get current state, then set new array
    const currentUsers = useWhiteboardStore.getState().onlineUsers;
    setOnlineUsers([...currentUsers, newMember]);
    console.log('👥 Online users now:', currentUsers.length + 1);
  }, [setOnlineUsers]);

  const handleUserLeft = useCallback((payload: any) => {
    console.log('👋 User left:', payload.username);
    
    // ✅ FIX: Get current state, then set filtered array
    const currentUsers = useWhiteboardStore.getState().onlineUsers;
    const filtered = currentUsers.filter(u => u.userId !== payload.userId);
    setOnlineUsers(filtered);
    console.log('👥 Online users now:', filtered.length);
  }, [setOnlineUsers]);

  const handleDrawEnd = useCallback((payload: any) => {
    console.log('✏️ Remote draw end');
    if (payload.element) {
      addElement(payload.element);
    }
  }, [addElement]);

  const handleElementAdd = useCallback((payload: any) => {
    console.log('➕ Remote element add');
    addElement(payload);
  }, [addElement]);

  const handleElementDelete = useCallback((payload: any) => {
    console.log('🗑️ Remote element delete:', payload.elementId);
    deleteElement(payload.elementId);
  }, [deleteElement]);

  const handleTextAdd = useCallback((payload: any) => {
    console.log('📝 Remote text add');
    const element = { type: 'text' as const, data: payload };
    addElement(element);
  }, [addElement]);

  const handleStickyAdd = useCallback((payload: any) => {
    console.log('📌 Remote sticky add');
    const element = { type: 'sticky' as const, data: payload };
    addElement(element);
  }, [addElement]);

  const handleClearBoard = useCallback(() => {
    console.log('🗑️ Board cleared remotely');
    setElements([]);
  }, [setElements]);

  const handleBoardMemberAdded = useCallback((payload: any) => {
    console.log('📢 You were added to a board:', payload.boardId);
    setNotification(`You've been added to a board as ${payload.role}!`);
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const handleBoardMemberRemoved = useCallback((payload: any) => {
    console.log('📢 You were removed from a board:', payload.boardId);
    if (payload.boardId === boardId) {
      setNotification('You have been removed from this board');
    }
  }, [boardId]);

  const handleBoardAccessRevoked = useCallback((payload: any) => {
    console.log('🚪 Access revoked to board:', payload.boardId);
    alert(payload.reason || 'You have been removed from this board');
    navigate('/dashboard');
  }, [navigate]);

  const handleError = useCallback((payload: any) => {
    console.error('❌ WebSocket error:', payload);
    if (payload.code === 'NO_ACCESS') {
      alert('You no longer have access to this board');
      navigate('/dashboard');
    } else {
      setError(payload.error || 'Unknown error');
    }
  }, [navigate]);

  useEffect(() => {
    if (!user || !token || !boardId) {
      navigate('/login');
      return;
    }

    // ✅ Setup handlers FIRST, then initialize
    setupMessageHandlers();
    initializeBoard();

    return () => {
      console.log('🔌 Leaving board...');
      wsService.send('BOARD_LEFT', {});
      cleanupHandlers();
      setElements([]);
      setOnlineUsers([]);
    };
  }, [boardId, user, token]);

  const setupMessageHandlers = () => {
    console.log('📡 Setting up message handlers...');
    
    wsService.on('BOARD_STATE', handleBoardState);
    wsService.on('USER_JOINED', handleUserJoined);
    wsService.on('USER_LEFT', handleUserLeft);
    wsService.on('DRAW_END', handleDrawEnd);
    wsService.on('ELEMENT_ADD', handleElementAdd);
    wsService.on('ELEMENT_DELETE', handleElementDelete);
    wsService.on('TEXT_ADD', handleTextAdd);
    wsService.on('STICKY_ADD', handleStickyAdd);
    wsService.on('CLEAR_BOARD', handleClearBoard);
    wsService.on('BOARD_MEMBER_ADDED', handleBoardMemberAdded);
    wsService.on('BOARD_MEMBER_REMOVED', handleBoardMemberRemoved);
    wsService.on('BOARD_ACCESS_REVOKED', handleBoardAccessRevoked);
    wsService.on('ERROR', handleError);

    console.log('✅ Message handlers registered');
  };

  const cleanupHandlers = () => {
    console.log('🧹 Cleaning up handlers...');
    
    wsService.off('BOARD_STATE', handleBoardState);
    wsService.off('USER_JOINED', handleUserJoined);
    wsService.off('USER_LEFT', handleUserLeft);
    wsService.off('DRAW_END', handleDrawEnd);
    wsService.off('ELEMENT_ADD', handleElementAdd);
    wsService.off('ELEMENT_DELETE', handleElementDelete);
    wsService.off('TEXT_ADD', handleTextAdd);
    wsService.off('STICKY_ADD', handleStickyAdd);
    wsService.off('CLEAR_BOARD', handleClearBoard);
    wsService.off('BOARD_MEMBER_ADDED', handleBoardMemberAdded);
    wsService.off('BOARD_MEMBER_REMOVED', handleBoardMemberRemoved);
    wsService.off('BOARD_ACCESS_REVOKED', handleBoardAccessRevoked);
    wsService.off('ERROR', handleError);
  };

  const initializeBoard = async () => {
    try {
      console.log('🔄 Initializing board:', boardId);

      const { board } = await apiService.getBoard(boardId!, user!.id);
      console.log('📋 Board loaded:', board.name, 'with', board.elements?.length || 0, 'elements');
      setCurrentBoard(board);

      if (board.elements && board.elements.length > 0) {
        console.log('✅ Setting', board.elements.length, 'elements from board');
        setElements(board.elements);
      } else {
        console.log('📝 Board is empty');
        setElements([]);
      }

      console.log('🔌 Connecting WebSocket...');
      await wsService.connect(token!);
      setIsConnected(true);
      console.log('✅ WebSocket connected');

      console.log('📡 Joining board via WebSocket...');
      wsService.send('BOARD_JOINED', { boardId });

      setLoading(false);
    } catch (err: any) {
      console.error('❌ Error initializing board:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const handleUndo = () => {
    console.log('↶ Sending UNDO');
    wsService.send('UNDO', {});
  };

  const handleClearBoardClick = () => {
    if (window.confirm('Clear entire board? This cannot be undone.')) {
      console.log('🗑️ Sending CLEAR_BOARD');
      wsService.send('CLEAR_BOARD', {});
    }
  };

  const handleSettings = () => {
    setShowSettings(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="text-xl mb-2">Loading whiteboard...</div>
          <div className="text-sm text-gray-500">{boardId}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
        <div className="text-xl text-red-600 mb-4">Error: {error}</div>
        <button
          onClick={handleBackToDashboard}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {notification && (
        <div className="bg-blue-500 text-white px-4 py-3 text-center">
          {notification}
        </div>
      )}

      <div className="bg-white shadow-sm px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToDashboard}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back
          </button>
          <h1 className="text-lg font-semibold">
            {useWhiteboardStore.getState().currentBoard?.name || 'Whiteboard'}
          </h1>
          <span className="text-sm text-gray-500">
            ({onlineUsers.length} online)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSettings}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          >
            ⚙️ Settings
          </button>
          <button
            onClick={handleUndo}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          >
            ↶ Undo
          </button>
          <button
            onClick={handleClearBoardClick}
            className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
          >
            🗑️ Clear
          </button>
          <span className="text-sm text-gray-500">
            {user?.displayName || user?.username}
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-20 bg-white shadow-lg">
          <Toolbar />
        </div>

        <div className="flex-1 relative">
          <BoardCanvas />
        </div>

        <div className="w-64 bg-white shadow-lg overflow-y-auto">
          <div className="p-4">
            <ColorPicker />
          </div>
          <div className="border-t">
            <UserList />
          </div>
        </div>
      </div>

      {showSettings && (
        <BoardSettings
          onClose={() => setShowSettings(false)}
          boardId={boardId!}
        />
      )}
    </div>
  );
}