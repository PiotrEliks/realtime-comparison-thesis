import { useWhiteboardStore } from '../../store/useWhiteboardStore';

export default function UserList() {
  const onlineUsers = useWhiteboardStore(state => state.onlineUsers);
  const currentBoard = useWhiteboardStore(state => state.currentBoard);

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">
        {currentBoard?.name || 'Whiteboard'}
      </h2>

      <h3 className="text-sm font-semibold text-gray-600 mb-2">
        Online Users ({onlineUsers.length})
      </h3>

      <div className="space-y-2">
        {onlineUsers.map(user => (
          <div key={user.userId} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: user.cursorColor }}
            />
            <span className="text-sm">{user.displayName || user.username}</span>
          </div>
        ))}
      </div>
    </div>
  );
}