import { useWhiteboardStore } from '../../store/useWhiteboardStore';
import type { ToolType } from '../../types';

const tools: { type: ToolType; icon: string; label: string }[] = [
  { type: 'pen', icon: '✏️', label: 'Pen' },
  { type: 'eraser', icon: '🧹', label: 'Eraser' },
  { type: 'rectangle', icon: '▭', label: 'Rectangle' },
  { type: 'circle', icon: '⭕', label: 'Circle' },
  { type: 'line', icon: '/', label: 'Line' },
  { type: 'text', icon: 'T', label: 'Text' },
  { type: 'sticky-note', icon: '📝', label: 'Sticky Note' },
];

export default function Toolbar() {
  const selectedTool = useWhiteboardStore(state => state.selectedTool);
  const setSelectedTool = useWhiteboardStore(state => state.setSelectedTool);

  return (
    <div className="flex flex-col items-center py-4 space-y-2">
      {tools.map(tool => (
        <button
          key={tool.type}
          onClick={() => setSelectedTool(tool.type)}
          className={`w-14 h-14 flex items-center justify-center rounded-lg text-2xl transition-colors ${
            selectedTool === tool.type
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 hover:bg-gray-200'
          }`}
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
}