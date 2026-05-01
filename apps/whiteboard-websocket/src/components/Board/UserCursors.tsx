import { useWhiteboardStore } from '../../store/useWhiteboardStore';
export default function UserCursors() {
  const cursors = useWhiteboardStore(state => state.cursors);
  const user = useWhiteboardStore(state => state.user);

  return (
    <>
      {Array.from(cursors.values())
        .filter(cursor => cursor.userId !== user?.id)
        .map(cursor => (
          <div
            key={cursor.userId}
            className="absolute pointer-events-none"
            style={{
              left: cursor.x,
              top: cursor.y,
              transform: 'translate(-50%, -50%)'
            }}
          >
            {/* Cursor dot */}
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: cursor.color }}
            />
            {/* User name */}
            <div
              className="absolute top-4 left-4 px-2 py-1 rounded text-xs text-white whitespace-nowrap"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.displayName || cursor.username}
            </div>
          </div>
        ))}
    </>
  );
}