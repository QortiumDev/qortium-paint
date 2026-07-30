import { describe, expect, it } from 'vitest';
import {
  clamp,
  constrainLine,
  fitWithin,
  hexToRgba,
  interpolateStroke,
  normalizeRect,
  rgbToHex,
} from './geometry';

describe('interpolateStroke', () => {
  it('returns a single point for a zero-length stroke (click = dot)', () => {
    expect(interpolateStroke({ x: 5, y: 5 }, { x: 5, y: 5 }, 2)).toEqual([{ x: 5, y: 5 }]);
  });

  it('always ends exactly at the destination', () => {
    const points = interpolateStroke({ x: 0, y: 0 }, { x: 10, y: 0 }, 3);
    const last = points[points.length - 1];

    expect(last).toEqual({ x: 10, y: 0 });
  });

  it('keeps consecutive points within the requested spacing', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 13, y: 7 };
    const spacing = 2;
    const points = interpolateStroke(from, to, spacing);

    let previous = from;

    for (const point of points) {
      expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThanOrEqual(spacing + 1e-9);
      previous = point;
    }
  });

  it('excludes the start point for non-degenerate strokes', () => {
    const points = interpolateStroke({ x: 0, y: 0 }, { x: 4, y: 0 }, 1);

    expect(points[0]).not.toEqual({ x: 0, y: 0 });
    expect(points).toHaveLength(4);
  });
});

describe('normalizeRect', () => {
  it('normalizes drags in any direction to positive sizes', () => {
    expect(normalizeRect({ x: 10, y: 10 }, { x: 4, y: 2 }, false)).toEqual({
      x: 4,
      y: 2,
      width: 6,
      height: 8,
    });
  });

  it('constrains to a square anchored at the start, following drag direction', () => {
    expect(normalizeRect({ x: 0, y: 0 }, { x: 10, y: 4 }, true)).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(normalizeRect({ x: 0, y: 0 }, { x: -10, y: 4 }, true)).toEqual({
      x: -10,
      y: 0,
      width: 10,
      height: 10,
    });
  });
});

describe('constrainLine', () => {
  it('snaps to the nearest 45-degree direction, preserving length', () => {
    const snapped = constrainLine({ x: 0, y: 0 }, { x: 10, y: 1 });

    expect(snapped.y).toBeCloseTo(0);
    expect(snapped.x).toBeCloseTo(Math.hypot(10, 1));

    const diagonal = constrainLine({ x: 0, y: 0 }, { x: 10, y: 9 });

    expect(diagonal.x).toBeCloseTo(diagonal.y);
  });

  it('leaves a zero-length line untouched', () => {
    expect(constrainLine({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
  });
});

describe('fitWithin', () => {
  it('scales down proportionally to fit', () => {
    expect(fitWithin(2048, 1536, 1024, 768)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(4000, 1000, 1000, 1000)).toEqual({ width: 1000, height: 250 });
  });

  it('never scales up', () => {
    expect(fitWithin(100, 50, 1024, 768)).toEqual({ width: 100, height: 50 });
  });

  it('handles degenerate sources', () => {
    expect(fitWithin(0, 0, 100, 100)).toEqual({ width: 1, height: 1 });
  });
});

describe('color helpers', () => {
  it('round-trips rgb <-> hex', () => {
    expect(rgbToHex(255, 0, 128)).toBe('#ff0080');
    expect(hexToRgba('#ff0080')).toEqual([255, 0, 128, 255]);
  });

  it('parses shorthand hex', () => {
    expect(hexToRgba('#fff')).toEqual([255, 255, 255, 255]);
    expect(hexToRgba('#f00')).toEqual([255, 0, 0, 255]);
  });

  it('rejects invalid colors', () => {
    expect(hexToRgba('red')).toBeNull();
    expect(hexToRgba('#12345')).toBeNull();
    expect(hexToRgba('')).toBeNull();
  });

  it('clamps out-of-range channels when formatting hex', () => {
    expect(rgbToHex(300, -5, 12)).toBe('#ff000c');
    expect(clamp(300, 0, 255)).toBe(255);
  });
});
