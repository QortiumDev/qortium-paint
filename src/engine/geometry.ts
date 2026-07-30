// Pure geometry/color helpers for the paint engine. No DOM access — every
// function here must stay unit-testable under plain jsdom/node.

export type Point = { x: number; y: number };

export type Rect = { x: number; y: number; width: number; height: number };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Points along the segment from `from` to `to`, spaced at most `spacing`
// apart, always including `to`. `from` is excluded (the previous segment
// already stamped it), except for the degenerate zero-length stroke where the
// single point is returned so a click still stamps a dot.
export function interpolateStroke(from: Point, to: Point, spacing: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return [{ x: to.x, y: to.y }];
  }

  const step = Math.max(spacing, 0.01);
  const count = Math.ceil(distance / step);
  const points: Point[] = [];

  for (let i = 1; i <= count; i += 1) {
    const t = i / count;

    points.push({ x: from.x + dx * t, y: from.y + dy * t });
  }

  return points;
}

// Normalizes a drag from `start` to `end` into a positive-size rect. With
// `constrain` the shorter side grows to match the longer one (square/circle),
// anchored at `start` and extending toward the drag direction.
export function normalizeRect(start: Point, end: Point, constrain: boolean): Rect {
  let dx = end.x - start.x;
  let dy = end.y - start.y;

  if (constrain) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));

    dx = dx < 0 ? -side : side;
    dy = dy < 0 ? -side : side;
  }

  return {
    x: dx < 0 ? start.x + dx : start.x,
    y: dy < 0 ? start.y + dy : start.y,
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
}

// Snaps the free end of a line to the nearest 45-degree direction from the
// anchor (shift-drag behavior).
export function constrainLine(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return { x: end.x, y: end.y };
  }

  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;

  return {
    x: start.x + Math.cos(angle) * distance,
    y: start.y + Math.sin(angle) * distance,
  };
}

// Scales (srcWidth, srcHeight) down to fit within (maxWidth, maxHeight),
// preserving aspect ratio. Never scales up. Returns at least 1x1.
export function fitWithin(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: 1, height: 1 };
  }

  const scale = Math.min(1, maxWidth / srcWidth, maxHeight / srcHeight);

  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

// Parses #rgb or #rrggbb into [r, g, b, 255]. Returns null for anything else.
export function hexToRgba(hex: string): [number, number, number, number] | null {
  const value = hex.trim().replace(/^#/, '');

  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    const r = parseInt(value[0] + value[0], 16);
    const g = parseInt(value[1] + value[1], 16);
    const b = parseInt(value[2] + value[2], 16);

    return [r, g, b, 255];
  }

  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
      255,
    ];
  }

  return null;
}
