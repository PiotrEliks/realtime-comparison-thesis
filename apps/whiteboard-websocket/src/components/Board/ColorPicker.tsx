// src/components/Board/ColorPicker.tsx

import { useWhiteboardStore } from '../../store/useWhiteboardStore';

const colors = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
  '#FFC0CB', '#A52A2A', '#808080', '#C0C0C0', '#FFD700'
];

export default function ColorPicker() {
  const selectedColor = useWhiteboardStore(state => state.selectedColor);
  const setSelectedColor = useWhiteboardStore(state => state.setSelectedColor);
  const strokeWidth = useWhiteboardStore(state => state.strokeWidth);
  const setStrokeWidth = useWhiteboardStore(state => state.setStrokeWidth);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2 text-gray-700">Color</h3>
        <div className="grid grid-cols-5 gap-2">
          {colors.map(color => (
            <button
              key={color}
              onClick={() => setSelectedColor(color)}
              className={`w-10 h-10 rounded border-2 transition-all ${
                selectedColor === color 
                  ? 'border-blue-500 scale-110' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>

        {/* Custom color input */}
        <div className="mt-2">
          <input
            type="color"
            value={selectedColor}
            onChange={(e) => setSelectedColor(e.target.value)}
            className="w-full h-10 rounded border-2 border-gray-300 cursor-pointer"
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-gray-700">
          Stroke Width: {strokeWidth}px
        </h3>
        <input
          type="range"
          min="1"
          max="50"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1px</span>
          <span>50px</span>
        </div>

        {/* Visual preview */}
        <div className="mt-2 bg-gray-100 rounded p-2 flex items-center justify-center h-16">
          <div
            style={{
              width: '80px',
              height: `${strokeWidth}px`,
              backgroundColor: selectedColor,
              borderRadius: `${strokeWidth / 2}px`
            }}
          />
        </div>
      </div>
    </div>
  );
}
