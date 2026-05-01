// src/components/Board/BoardCanvas.tsx

import { useRef, useEffect, useState } from 'react';
import { useWhiteboardStore } from '../../store/useWhiteboardStore';
import { wsService } from '../../services/WebSocketService';
import UserCursors from './UserCursors';
import type { Point, CanvasElement } from '../../types';

export default function BoardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
  
  // Shape drawing state
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [shapeCurrent, setShapeCurrent] = useState<Point | null>(null);

  // Store state
  const user = useWhiteboardStore(state => state.user);
  const elements = useWhiteboardStore(state => state.elements);
  const addElement = useWhiteboardStore(state => state.addElement);
  const selectedTool = useWhiteboardStore(state => state.selectedTool);
  const selectedColor = useWhiteboardStore(state => state.selectedColor);
  const strokeWidth = useWhiteboardStore(state => state.strokeWidth);
  const isDrawing = useWhiteboardStore(state => state.isDrawing);
  const setIsDrawing = useWhiteboardStore(state => state.setIsDrawing);
  const currentPath = useWhiteboardStore(state => state.currentPath);
  const setCurrentPath = useWhiteboardStore(state => state.setCurrentPath);
  const updateCursor = useWhiteboardStore(state => state.updateCursor);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth - 284;
    canvas.height = window.innerHeight;

    const context = canvas.getContext('2d');
    if (context) {
      context.lineCap = 'round';
      context.lineJoin = 'round';
      setCtx(context);
    }
  }, []);

  // Render elements
  useEffect(() => {
    if (!ctx) return;
    redrawCanvas();
  }, [ctx, elements, shapeStart, shapeCurrent]);

  // Setup WebSocket listeners
  useEffect(() => {
    wsService.on('DRAW_END', handleRemoteDrawEnd);
    wsService.on('ELEMENT_ADD', handleRemoteElementAdd);
    wsService.on('CURSOR_MOVE', handleRemoteCursorMove);
    wsService.on('BOARD_STATE', handleBoardState);

    return () => {
      wsService.off('DRAW_END', handleRemoteDrawEnd);
      wsService.off('ELEMENT_ADD', handleRemoteElementAdd);
      wsService.off('CURSOR_MOVE', handleRemoteCursorMove);
      wsService.off('BOARD_STATE', handleBoardState);
    };
  }, []);

  const handleBoardState = (payload: any) => {
    console.log('📋 Board state received:', payload.elements?.length, 'elements');
    if (payload.elements) {
      useWhiteboardStore.getState().setElements(payload.elements);
    }
  };

  const getMousePos = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    setIsDrawing(true);

    if (selectedTool === 'pen' || selectedTool === 'eraser') {
      // Freehand drawing
      setCurrentPath([pos]);
      wsService.send('DRAW_START', {
        x: pos.x,
        y: pos.y,
        color: selectedColor,
        strokeWidth,
        tool: selectedTool
      });
    } else if (['rectangle', 'circle', 'line', 'triangle', 'arrow'].includes(selectedTool)) {
      // Shape drawing
      setShapeStart(pos);
      setShapeCurrent(pos);
    } else if (selectedTool === 'text') {
      // Text tool
      addTextElement(pos);
    } else if (selectedTool === 'sticky-note') {
      // Sticky note
      addStickyNote(pos);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e);

    // Send cursor position
    wsService.send('CURSOR_MOVE', {
      x: pos.x,
      y: pos.y,
      tool: selectedTool
    });

    if (!isDrawing) return;

    if (selectedTool === 'pen' || selectedTool === 'eraser') {
      // Freehand drawing
      const newPath = [...currentPath, pos];
      setCurrentPath(newPath);

      // Draw locally
      if (ctx && currentPath.length > 0) {
        ctx.strokeStyle = selectedTool === 'eraser' ? '#FFFFFF' : selectedColor;
        ctx.lineWidth = strokeWidth;
        ctx.beginPath();
        ctx.moveTo(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }

      wsService.send('DRAW_MOVE', { x: pos.x, y: pos.y });
    } else if (shapeStart) {
      // Shape drawing preview
      setShapeCurrent(pos);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (selectedTool === 'pen' || selectedTool === 'eraser') {
      // Finish freehand drawing
      const element: CanvasElement = {
        type: 'path',
        data: {
          id: crypto.randomUUID(),
          points: currentPath,
          color: selectedTool === 'eraser' ? '#FFFFFF' : selectedColor,
          strokeWidth,
          tool: selectedTool as 'pen' | 'eraser',
          userId: user!.id,
          timestamp: Date.now()
        }
      };

      addElement(element);
      wsService.send('DRAW_END', { element });
      setCurrentPath([]);
    } else if (shapeStart && shapeCurrent) {
      // Finish shape drawing
      addShapeElement(shapeStart, shapeCurrent);
      setShapeStart(null);
      setShapeCurrent(null);
    }
  };

  const addShapeElement = (start: Point, end: Point) => {
    const element: CanvasElement = {
      type: 'shape',
      data: {
        id: crypto.randomUUID(),
        type: selectedTool as any,
        x: start.x,
        y: start.y,
        width: end.x - start.x,
        height: end.y - start.y,
        x2: end.x,
        y2: end.y,
        radius: Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)),
        color: selectedColor,
        strokeWidth,
        filled: false,
        userId: user!.id,
        timestamp: Date.now()
      }
    };

    addElement(element);
    wsService.send('ELEMENT_ADD', element);
  };

  const addTextElement = (pos: Point) => {
    const text = prompt('Enter text:');
    if (!text) return;

    const element: CanvasElement = {
      type: 'text',
      data: {
        id: crypto.randomUUID(),
        x: pos.x,
        y: pos.y,
        text,
        fontSize: 24,
        color: selectedColor,
        fontFamily: 'Arial',
        userId: user!.id,
        timestamp: Date.now()
      }
    };

    addElement(element);
    wsService.send('TEXT_ADD', element.data);
    setIsDrawing(false);
  };

  const addStickyNote = (pos: Point) => {
    const text = prompt('Enter note text:');
    if (!text) return;

    const element: CanvasElement = {
      type: 'sticky',
      data: {
        id: crypto.randomUUID(),
        x: pos.x,
        y: pos.y,
        width: 200,
        height: 200,
        text,
        color: '#FFEB3B',
        userId: user!.id,
        timestamp: Date.now()
      }
    };

    addElement(element);
    wsService.send('STICKY_ADD', element.data);
    setIsDrawing(false);
  };

  const handleRemoteDrawEnd = (payload: any) => {
    if (payload.element) {
      addElement(payload.element);
    }
  };

  const handleRemoteElementAdd = (payload: any) => {
    addElement(payload);
  };

  const handleRemoteCursorMove = (payload: any) => {
    updateCursor(payload.userId, payload);
  };

  const redrawCanvas = () => {
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw all elements
    elements.forEach(element => {
      if (element.type === 'path') {
        drawPath(element.data);
      } else if (element.type === 'shape') {
        drawShape(element.data);
      } else if (element.type === 'text') {
        drawText(element.data);
      } else if (element.type === 'sticky') {
        drawSticky(element.data);
      }
    });

    // Draw shape preview
    if (shapeStart && shapeCurrent && isDrawing) {
      drawShapePreview(shapeStart, shapeCurrent);
    }
  };

  const drawPath = (path: any) => {
    if (!ctx || path.points.length === 0) return;

    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.strokeWidth;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);

    path.points.forEach((point: Point) => {
      ctx.lineTo(point.x, point.y);
    });

    ctx.stroke();
  };

  const drawShape = (shape: any) => {
    if (!ctx) return;

    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.strokeWidth;

    switch (shape.type) {
      case 'rectangle':
        if (shape.filled) {
          ctx.fillStyle = shape.color;
          ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        } else {
          ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
        }
        break;

      case 'circle':
        ctx.beginPath();
        const centerX = shape.x + shape.width / 2;
        const centerY = shape.y + shape.height / 2;
        const radius = Math.min(Math.abs(shape.width), Math.abs(shape.height)) / 2;
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        if (shape.filled) {
          ctx.fillStyle = shape.color;
          ctx.fill();
        } else {
          ctx.stroke();
        }
        break;

      case 'line':
        ctx.beginPath();
        ctx.moveTo(shape.x, shape.y);
        ctx.lineTo(shape.x2, shape.y2);
        ctx.stroke();
        break;

      case 'arrow':
        drawArrow(shape);
        break;

      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(shape.x + shape.width / 2, shape.y);
        ctx.lineTo(shape.x, shape.y + shape.height);
        ctx.lineTo(shape.x + shape.width, shape.y + shape.height);
        ctx.closePath();
        if (shape.filled) {
          ctx.fillStyle = shape.color;
          ctx.fill();
        } else {
          ctx.stroke();
        }
        break;
    }
  };

  const drawShapePreview = (start: Point, current: Point) => {
    if (!ctx) return;

    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = strokeWidth;
    ctx.setLineDash([5, 5]); // Dashed preview

    const width = current.x - start.x;
    const height = current.y - start.y;

    switch (selectedTool) {
      case 'rectangle':
        ctx.strokeRect(start.x, start.y, width, height);
        break;

      case 'circle':
        ctx.beginPath();
        const centerX = start.x + width / 2;
        const centerY = start.y + height / 2;
        const radius = Math.min(Math.abs(width), Math.abs(height)) / 2;
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;

      case 'line':
      case 'arrow':
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(current.x, current.y);
        ctx.stroke();
        break;

      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(start.x + width / 2, start.y);
        ctx.lineTo(start.x, start.y + height);
        ctx.lineTo(start.x + width, start.y + height);
        ctx.closePath();
        ctx.stroke();
        break;
    }

    ctx.setLineDash([]); // Reset dash
  };

  const drawArrow = (shape: any) => {
    if (!ctx) return;

    const headLength = 15;
    const dx = shape.x2 - shape.x;
    const dy = shape.y2 - shape.y;
    const angle = Math.atan2(dy, dx);

    // Draw line
    ctx.beginPath();
    ctx.moveTo(shape.x, shape.y);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(shape.x2, shape.y2);
    ctx.lineTo(
      shape.x2 - headLength * Math.cos(angle - Math.PI / 6),
      shape.y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(shape.x2, shape.y2);
    ctx.lineTo(
      shape.x2 - headLength * Math.cos(angle + Math.PI / 6),
      shape.y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  };

  const drawText = (text: any) => {
    if (!ctx) return;

    ctx.fillStyle = text.color;
    ctx.font = `${text.fontSize}px ${text.fontFamily || 'Arial'}`;
    ctx.fillText(text.text, text.x, text.y);
  };

  const drawSticky = (sticky: any) => {
  if (!ctx) return;

  // ✅ FIX: Ensure sticky has required properties
  const stickyText = sticky.text || '';
  const stickyColor = sticky.color || '#FFEB3B';
  const stickyX = sticky.x || 0;
  const stickyY = sticky.y || 0;
  const stickyWidth = sticky.width || 200;
  const stickyHeight = sticky.height || 200;

  // Background
  ctx.fillStyle = stickyColor;
  ctx.fillRect(stickyX, stickyY, stickyWidth, stickyHeight);

  // Text
  ctx.fillStyle = '#000';
  ctx.font = '14px Arial';
  const lines = wrapText(stickyText, stickyWidth - 20);
  lines.forEach((line, i) => {
    ctx.fillText(line, stickyX + 10, stickyY + 30 + (i * 20));
  });

  // Border
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(stickyX, stickyY, stickyWidth, stickyHeight);
};

  const wrapText = (text: string, maxWidth: number): string[] => {
  // ✅ FIX: Handle undefined/null text
  if (!text || typeof text !== 'string') {
    return [''];
  }

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine + word + ' ';
    if (ctx!.measureText(testLine).width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word + ' ';
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
};

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setIsDrawing(false)}
        className="cursor-crosshair bg-white"
      />
      <UserCursors />
    </div>
  );
}
