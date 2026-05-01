import React, { useState } from 'react';
import { Plus, MessageSquare, Users, Wifi, WifiOff, Clock, LogOut } from 'lucide-react';
import { useAuth } from '@realtime-thesis/shared-ui/src/contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { CreateChatModal } from './CreateChatModal';

export const RoomList: React.FC = () => {
  const { user, logout } = useAuth();
  const { rooms, currentRoom, selectRoom, connectionStatus, latency } = useChat();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const getOtherMember = (room: any) => {
    if (room.type === 'private') {
      return room.members?.find((m: any) => m.id !== user?.id);
    }
    return null;
  };

  const getRoomName = (room: any) => {
    if (room.type === 'group') {
      return room.name || 'Unnamed Group';
    }
    const otherMember = getOtherMember(room);
    return otherMember?.user?.displayName || otherMember?.user?.username || 'Unknown User';
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return `${Math.floor(minutes / 1440)}d ago`;
  };

  return (
    <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full">
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-medium">
              {user?.displayName?.charAt(0) || user?.username.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-slate-800 truncate">
                {user?.displayName || user?.username}
              </h2>
              <div className="flex items-center gap-2 text-xs">
                {connectionStatus === 'connected' ? (
                  <><Wifi className="w-3 h-3 text-green-500" /><span className="text-green-600">Online</span></>
                ) : (
                  <><WifiOff className="w-3 h-3 text-red-500" /><span className="text-red-600">Offline</span></>
                )}
                <span className="text-slate-400">•</span>
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-slate-500">{latency}ms</span>
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full py-2 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all flex items-center justify-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">No chats yet</p>
            <p className="text-xs mt-1">Start a new conversation</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {rooms.map(room => {
              const otherMember = getOtherMember(room);
              const isActive = currentRoom?.id === room.id;
              const lastMessage = room.messages?.[0];

              return (
                <button
                  key={room.id}
                  onClick={() => selectRoom(room.id)}
                  className={`w-full p-3 rounded-lg transition-all text-left ${
                    isActive
                      ? 'bg-blue-50 border-2 border-blue-200'
                      : 'hover:bg-slate-50 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-medium">
                        {room.type === 'group' ? (
                          <Users className="w-6 h-6" />
                        ) : (
                          getRoomName(room).charAt(0).toUpperCase()
                        )}
                      </div>
                      {room.type === 'private' && otherMember?.status === 'online' && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium text-slate-800 truncate">
                          {getRoomName(room)}
                        </h3>
                        {lastMessage?.createdAt && (
                          <span className="text-xs text-slate-400">
                            {formatTime(lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      {lastMessage && (
                        <p className="text-sm text-slate-500 truncate">
                          {lastMessage.author?.displayName || lastMessage.author?.username}: {lastMessage.content}
                          {console.log('Last message content:', lastMessage)}
                        </p>
                      )}
                      {room.type === 'group' && (
                        <p className="text-xs text-slate-400 mt-1">
                          {room.members?.length || 0} members
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateChatModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
};
