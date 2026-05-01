// shared-whiteboard/src/utils/canvas.ts

import { Point, CanvasElement } from '../../types/whiteboard/index';

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Simplify path using Douglas-Peucker algorithm
 * Reduces number of points while maintaining shape
 */
export function simplifyPath(points: Point[], tolerance: number = 2): Point[] {
  if (points.length <= 2) return points;

  function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) return distance(point, lineStart);
    
    const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);
    const closestPoint = {
      x: lineStart.x + u * dx,
      y: lineStart.y + u * dy
    };
    return distance(point, closestPoint);
  }

  function simplify(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return points;

    let maxDistance = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[0], points[end]);
      if (d > maxDistance) {
        index = i;
        maxDistance = d;
      }
    }

    if (maxDistance > epsilon) {
      const left = simplify(points.slice(0, index + 1), epsilon);
      const right = simplify(points.slice(index), epsilon);
      return [...left.slice(0, -1), ...right];
    }

    return [points[0], points[end]];
  }

  return simplify(points, tolerance);
}

/**
 * Generate thumbnail from canvas elements
 * (Simplified - w prawdziwej implementacji renderujemy na canvas i exportujemy)
 */
export function generateThumbnail(elements: CanvasElement[]): string | null {
  // TODO: Implement actual canvas rendering
  // For now, return null
  return null;
}

/**
 * Calculate bounding box for elements
 */
export function getBoundingBox(elements: CanvasElement[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  elements.forEach(element => {
    if (element.type === 'path') {
      element.data.points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    } else if (element.type === 'shape') {
      const { x, y, width, height, radius } = element.data;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + (width || radius || 0));
      maxY = Math.max(maxY, y + (height || radius || 0));
    } else if (element.type === 'text') {
      minX = Math.min(minX, element.data.x);
      minY = Math.min(minY, element.data.y);
      maxX = Math.max(maxX, element.data.x + 200);  // Estimate
      maxY = Math.max(maxY, element.data.y + element.data.fontSize);
    } else if (element.type === 'sticky') {
      const { x, y, width, height } = element.data;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }
  });

  return { minX, minY, maxX, maxY };
}

/**
 * Validate canvas element
 */
export function validateElement(element: CanvasElement): boolean {
  try {
    if (!element || !element.type) return false;

    switch (element.type) {
      case 'path':
        return Array.isArray(element.data.points) && element.data.points.length > 0;
      
      case 'shape':
        return element.data.x !== undefined && element.data.y !== undefined;
      
      case 'text':
        return element.data.x !== undefined && element.data.y !== undefined && element.data.text !== undefined;
      
      case 'sticky':
        return element.data.x !== undefined && element.data.y !== undefined && element.data.width !== undefined;
      
      default:
        return false;
    }
  } catch {
    return false;
  }
}
