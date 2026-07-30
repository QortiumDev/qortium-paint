// PaintEngine — owns the pixels of the two canvases the UI hands it (main =
// committed document, overlay = previews/floating image). No other DOM
// access, no bridge imports. Implements PaintEngineApi from src/types.ts.

import type { EngineListener, EngineState, ExportFormat, PaintEngineApi, ToolId } from '../types';
import { DEFAULT_FILL_TOLERANCE, floodFill } from './floodFill';
import {
  clamp,
  constrainLine,
  fitWithin,
  hexToRgba,
  interpolateStroke,
  normalizeRect,
  rgbToHex,
  type Point,
} from './geometry';
import { SnapshotHistory } from './history';

export const DEFAULT_CANVAS_WIDTH = 1024;
export const DEFAULT_CANVAS_HEIGHT = 768;
export const MIN_CANVAS_SIZE = 16;
export const MAX_CANVAS_SIZE = 4096;
export const MIN_TOOL_SIZE = 1;
export const MAX_TOOL_SIZE = 64;
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
export const DEFAULT_JPEG_QUALITY = 0.92;

const BACKGROUND_COLOR = '#ffffff';
const FLOATING_HANDLE_SCREEN_PX = 7;

type FloatingImage = {
  aspect: number;
  height: number;
  source: CanvasImageSource;
  width: number;
  x: number;
  y: number;
};

type DragState =
  | { kind: 'stroke'; erase: boolean; last: Point }
  | { kind: 'shape'; tool: 'line' | 'rect' | 'ellipse'; start: Point; current: Point; shift: boolean }
  | { kind: 'pan'; lastClientX: number; lastClientY: number }
  | { kind: 'float-move'; offsetX: number; offsetY: number }
  | { kind: 'float-scale'; anchor: Point; aspect: number };

type CursorListener = (position: Point | null) => void;
type ColorPickListener = (color: string) => void;
type TextRequestListener = (position: Point) => void;
type PanListener = (dx: number, dy: number) => void;

function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  }

  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }

  const anySource = source as { width?: unknown; height?: unknown };
  const width = typeof anySource.width === 'number' ? anySource.width : 1;
  const height = typeof anySource.height === 'number' ? anySource.height : 1;

  return { width, height };
}

async function decodeBlob(blob: Blob): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall through to the HTMLImageElement path (e.g. unsupported format
      // combinations in older WebViews).
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image.'));
    };
    image.src = url;
  });
}

function decodeDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode snapshot.'));
    image.src = dataUrl;
  });
}

export class PaintEngine implements PaintEngineApi {
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly octx: CanvasRenderingContext2D;
  private readonly dpr: number;
  private readonly history = new SnapshotHistory<string>();

  private width = DEFAULT_CANVAS_WIDTH;
  private height = DEFAULT_CANVAS_HEIGHT;
  private zoom = 1;
  private tool: ToolId = 'brush';
  private previousTool: ToolId = 'brush';
  private color = '#111111';
  private toolSize = 4;
  private shapeFill = false;
  private dirty = false;
  private floating: FloatingImage | null = null;
  private drag: DragState | null = null;
  private activePointerId: number | null = null;
  private restoreToken = 0;
  private destroyed = false;

  private readonly listeners = new Set<EngineListener>();
  private readonly cursorListeners = new Set<CursorListener>();
  private readonly colorPickListeners = new Set<ColorPickListener>();
  private readonly textRequestListeners = new Set<TextRequestListener>();
  private readonly panListeners = new Set<PanListener>();

  constructor(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.canvas = canvas;
    this.overlay = overlay;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const octx = overlay.getContext('2d');

    if (!ctx || !octx) {
      throw new Error('Canvas 2D context unavailable.');
    }

    this.ctx = ctx;
    this.octx = octx;
    this.dpr = clamp(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 1, 3);

    overlay.style.touchAction = 'none';
    this.setDocumentSize(DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, false);
    this.history.reset(this.snapshotDataUrl());
    this.updateCursor();

    overlay.addEventListener('pointerdown', this.onPointerDown);
    overlay.addEventListener('pointermove', this.onPointerMove);
    overlay.addEventListener('pointerup', this.onPointerUp);
    overlay.addEventListener('pointercancel', this.onPointerCancel);
    overlay.addEventListener('pointerleave', this.onPointerLeave);
  }

  destroy(): void {
    this.destroyed = true;
    this.overlay.removeEventListener('pointerdown', this.onPointerDown);
    this.overlay.removeEventListener('pointermove', this.onPointerMove);
    this.overlay.removeEventListener('pointerup', this.onPointerUp);
    this.overlay.removeEventListener('pointercancel', this.onPointerCancel);
    this.overlay.removeEventListener('pointerleave', this.onPointerLeave);
    this.listeners.clear();
    this.cursorListeners.clear();
    this.colorPickListeners.clear();
    this.textRequestListeners.clear();
    this.panListeners.clear();
  }

  // ---- PaintEngineApi ------------------------------------------------------

  getState(): EngineState {
    return {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      canvasSize: { width: this.width, height: this.height },
      dirty: this.dirty,
      floatingImage: this.floating !== null,
      tool: this.tool,
      zoom: this.zoom,
    };
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  setTool(tool: ToolId): void {
    if (tool === this.tool) {
      return;
    }

    // 'place' only makes sense while a floating image exists.
    if (tool === 'place' && !this.floating) {
      return;
    }

    // Switching away from placement commits the floating image (keeps
    // pixels; explicit cancel is discardFloatingImage / Escape).
    if (this.floating && tool !== 'place') {
      this.commitFloatingImage();
    }

    this.tool = tool;
    this.updateCursor();
    this.notify();
  }

  setColor(color: string): void {
    if (hexToRgba(color)) {
      this.color = color.toLowerCase();
    }
  }

  setToolSize(size: number): void {
    this.toolSize = clamp(Math.round(size), MIN_TOOL_SIZE, MAX_TOOL_SIZE);
  }

  clear(): void {
    if (this.floating) {
      this.discardFloatingImage();
    }

    this.fillBackground(this.ctx);
    this.recordHistory();
  }

  resizeCanvas(width: number, height: number): void {
    const w = clamp(Math.round(width), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const h = clamp(Math.round(height), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);

    if (w === this.width && h === this.height) {
      return;
    }

    this.setDocumentSize(w, h, true);

    if (this.floating) {
      this.drawFloatingPreview();
    }

    this.recordHistory();
  }

  undo(): void {
    // Uncommitted floating image: undo just cancels the placement.
    if (this.floating) {
      this.discardFloatingImage();

      return;
    }

    const snapshot = this.history.undo();

    if (snapshot !== null) {
      this.dirty = true;
      void this.applySnapshot(snapshot);
      this.notify();
    }
  }

  redo(): void {
    if (this.floating) {
      return;
    }

    const snapshot = this.history.redo();

    if (snapshot !== null) {
      this.dirty = true;
      void this.applySnapshot(snapshot);
      this.notify();
    }
  }

  async importImage(source: Blob): Promise<void> {
    const decoded = await decodeBlob(source);

    if (this.destroyed) {
      return;
    }

    // Replacing a pending floating image keeps the document untouched.
    if (this.floating) {
      this.floating = null;
      this.clearOverlay();
    } else {
      this.previousTool = this.tool === 'place' ? 'brush' : this.tool;
    }

    const { width: srcWidth, height: srcHeight } = sourceSize(decoded);
    const fitted = fitWithin(srcWidth, srcHeight, this.width, this.height);

    this.floating = {
      aspect: fitted.width / Math.max(1, fitted.height),
      height: fitted.height,
      source: decoded,
      width: fitted.width,
      x: Math.round((this.width - fitted.width) / 2),
      y: Math.round((this.height - fitted.height) / 2),
    };
    this.tool = 'place';
    this.updateCursor();
    this.drawFloatingPreview();
    this.notify();
  }

  commitFloatingImage(): void {
    const floating = this.floating;

    if (!floating) {
      return;
    }

    this.ctx.drawImage(floating.source, floating.x, floating.y, floating.width, floating.height);
    this.floating = null;
    this.drag = null;
    this.clearOverlay();
    this.tool = this.previousTool;
    this.updateCursor();
    this.recordHistory();
  }

  discardFloatingImage(): void {
    if (!this.floating) {
      return;
    }

    this.floating = null;
    this.drag = null;
    this.clearOverlay();
    this.tool = this.previousTool;
    this.updateCursor();
    this.notify();
  }

  async exportBlob(format: ExportFormat, quality?: number): Promise<Blob> {
    const composed = this.composeDocument();
    const q = format === 'image/jpeg' ? (quality ?? DEFAULT_JPEG_QUALITY) : quality;

    return await new Promise<Blob>((resolve, reject) => {
      composed.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Export failed: canvas.toBlob returned null.'));
          }
        },
        format,
        q,
      );
    });
  }

  snapshotDataUrl(): string {
    return this.composeDocument().toDataURL('image/png');
  }

  async loadSnapshot(dataUrl: string): Promise<void> {
    const image = await decodeDataUrl(dataUrl);

    if (this.destroyed) {
      return;
    }

    if (this.floating) {
      this.discardFloatingImage();
    }

    const w = clamp(image.naturalWidth || image.width, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const h = clamp(image.naturalHeight || image.height, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);

    this.restoreToken += 1;
    this.setDocumentSize(w, h, false);
    this.ctx.drawImage(image, 0, 0, w, h);
    this.history.reset(this.snapshotDataUrl());
    // Loaded content (crash-recovery restore) has not been saved anywhere.
    this.dirty = true;
    this.notify();
  }

  // ---- Extra engine surface used by the UI --------------------------------

  markClean(): void {
    if (!this.dirty) {
      return;
    }

    this.dirty = false;
    this.notify();
  }

  getColor(): string {
    return this.color;
  }

  getToolSize(): number {
    return this.toolSize;
  }

  setShapeFill(fill: boolean): void {
    this.shapeFill = fill;
  }

  // Commits a text entry the UI collected (position in document coords).
  drawText(text: string, x: number, y: number, font: string, size: number, color: string): void {
    if (!text.trim()) {
      return;
    }

    const ctx = this.ctx;

    ctx.save();
    ctx.font = `${clamp(size, 4, 512)}px ${font}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = hexToRgba(color) ? color : this.color;

    const lineHeight = size * 1.25;

    text.split('\n').forEach((line, index) => {
      ctx.fillText(line, x, y + index * lineHeight);
    });
    ctx.restore();
    this.recordHistory();
  }

  setZoom(zoom: number): void {
    const target = clamp(zoom, ZOOM_STEPS[0], ZOOM_STEPS[ZOOM_STEPS.length - 1] as number);
    let closest: number = ZOOM_STEPS[0];

    for (const step of ZOOM_STEPS) {
      if (Math.abs(step - target) < Math.abs(closest - target)) {
        closest = step;
      }
    }

    if (closest === this.zoom) {
      return;
    }

    this.zoom = closest;
    this.applyCssSize();

    // Overlay chrome (dashes/handles) is zoom-compensated; redraw it.
    if (this.floating) {
      this.drawFloatingPreview();
    }

    this.notify();
  }

  zoomIn(): void {
    const index = ZOOM_STEPS.indexOf(this.zoom as (typeof ZOOM_STEPS)[number]);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, index + 1)];

    this.setZoom(next ?? 1);
  }

  zoomOut(): void {
    const index = ZOOM_STEPS.indexOf(this.zoom as (typeof ZOOM_STEPS)[number]);
    const next = ZOOM_STEPS[Math.max(0, index - 1)];

    this.setZoom(next ?? 1);
  }

  onCursorMove(listener: CursorListener): () => void {
    this.cursorListeners.add(listener);

    return () => {
      this.cursorListeners.delete(listener);
    };
  }

  onColorPick(listener: ColorPickListener): () => void {
    this.colorPickListeners.add(listener);

    return () => {
      this.colorPickListeners.delete(listener);
    };
  }

  onTextRequest(listener: TextRequestListener): () => void {
    this.textRequestListeners.add(listener);

    return () => {
      this.textRequestListeners.delete(listener);
    };
  }

  // dx/dy are raw pointer deltas in screen px; the UI scrolls its container.
  onPan(listener: PanListener): () => void {
    this.panListeners.add(listener);

    return () => {
      this.panListeners.delete(listener);
    };
  }

  // ---- Internals -----------------------------------------------------------

  private notify(): void {
    const state = this.getState();

    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private setDocumentSize(width: number, height: number, preserve: boolean): void {
    let saved: HTMLCanvasElement | null = null;
    const oldWidth = this.width;
    const oldHeight = this.height;

    if (preserve && this.canvas.width > 0 && this.canvas.height > 0) {
      saved = document.createElement('canvas');
      saved.width = this.canvas.width;
      saved.height = this.canvas.height;
      const savedCtx = saved.getContext('2d');

      savedCtx?.drawImage(this.canvas, 0, 0);
    }

    this.width = width;
    this.height = height;

    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
    this.overlay.width = this.canvas.width;
    this.overlay.height = this.canvas.height;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.fillBackground(this.ctx);

    if (saved) {
      // Old backing store drawn back at its logical size (top-left anchored).
      this.ctx.drawImage(saved, 0, 0, oldWidth, oldHeight);
    }

    this.applyCssSize();
  }

  private applyCssSize(): void {
    const cssWidth = `${this.width * this.zoom}px`;
    const cssHeight = `${this.height * this.zoom}px`;

    this.canvas.style.width = cssWidth;
    this.canvas.style.height = cssHeight;
    this.overlay.style.width = cssWidth;
    this.overlay.style.height = cssHeight;
  }

  private fillBackground(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  private composeDocument(): HTMLCanvasElement {
    const composed = document.createElement('canvas');

    composed.width = this.width;
    composed.height = this.height;

    const ctx = composed.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas 2D context unavailable.');
    }

    // JPEG has no alpha; the document is opaque white anyway, but flatten
    // defensively so exports never come out black.
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.drawImage(this.canvas, 0, 0, this.width, this.height);

    return composed;
  }

  private recordHistory(): void {
    this.history.record(this.snapshotDataUrl());
    this.dirty = true;
    this.notify();
  }

  private async applySnapshot(dataUrl: string): Promise<void> {
    this.restoreToken += 1;
    const token = this.restoreToken;

    try {
      const image = await decodeDataUrl(dataUrl);

      if (this.destroyed || token !== this.restoreToken) {
        return;
      }

      const w = image.naturalWidth || image.width;
      const h = image.naturalHeight || image.height;

      if (w !== this.width || h !== this.height) {
        this.setDocumentSize(w, h, false);
      } else {
        this.fillBackground(this.ctx);
      }

      this.ctx.drawImage(image, 0, 0, this.width, this.height);
      this.notify();
    } catch {
      // Snapshot decode failure leaves the current pixels in place.
    }
  }

  private clearOverlay(): void {
    this.octx.save();
    this.octx.setTransform(1, 0, 0, 1, 0, 0);
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.octx.restore();
  }

  private toDocPoint(event: PointerEvent): Point {
    const rect = this.overlay.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * this.width,
      y: ((event.clientY - rect.top) / rect.height) * this.height,
    };
  }

  private updateCursor(): void {
    const cursors: Record<ToolId, string> = {
      brush: 'crosshair',
      eraser: 'crosshair',
      line: 'crosshair',
      rect: 'crosshair',
      ellipse: 'crosshair',
      fill: 'crosshair',
      text: 'text',
      picker: 'crosshair',
      pan: 'grab',
      place: 'move',
    };

    this.overlay.style.cursor = cursors[this.tool];
  }

  private emitCursor(position: Point | null): void {
    for (const listener of this.cursorListeners) {
      listener(position);
    }
  }

  // ---- Pointer handling ----------------------------------------------------

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.activePointerId !== null) {
      return;
    }

    event.preventDefault();
    this.activePointerId = event.pointerId;

    try {
      this.overlay.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail for departed pointers; drawing still works.
    }

    const point = this.toDocPoint(event);

    switch (this.tool) {
      case 'brush':
      case 'eraser': {
        this.drag = { kind: 'stroke', erase: this.tool === 'eraser', last: point };
        this.stampSegment(point, point);
        break;
      }
      case 'line':
      case 'rect':
      case 'ellipse': {
        this.drag = { kind: 'shape', tool: this.tool, start: point, current: point, shift: event.shiftKey };
        this.drawShapePreview();
        break;
      }
      case 'fill': {
        this.applyFill(point);
        break;
      }
      case 'text': {
        for (const listener of this.textRequestListeners) {
          listener(point);
        }
        break;
      }
      case 'picker': {
        this.pickColor(point);
        break;
      }
      case 'pan': {
        this.drag = { kind: 'pan', lastClientX: event.clientX, lastClientY: event.clientY };
        this.overlay.style.cursor = 'grabbing';
        break;
      }
      case 'place': {
        this.beginFloatingDrag(point);
        break;
      }
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const point = this.toDocPoint(event);

    if (point.x >= 0 && point.y >= 0 && point.x <= this.width && point.y <= this.height) {
      this.emitCursor({ x: Math.floor(point.x), y: Math.floor(point.y) });
    } else {
      this.emitCursor(null);
    }

    if (event.pointerId !== this.activePointerId || !this.drag) {
      return;
    }

    event.preventDefault();

    switch (this.drag.kind) {
      case 'stroke': {
        const events =
          typeof event.getCoalescedEvents === 'function' && event.getCoalescedEvents().length > 0
            ? event.getCoalescedEvents()
            : [event];

        for (const sample of events) {
          const next = this.toDocPoint(sample);

          this.stampSegment(this.drag.last, next);
          this.drag.last = next;
        }
        break;
      }
      case 'shape': {
        this.drag.current = point;
        this.drag.shift = event.shiftKey;
        this.drawShapePreview();
        break;
      }
      case 'pan': {
        const dx = event.clientX - this.drag.lastClientX;
        const dy = event.clientY - this.drag.lastClientY;

        this.drag.lastClientX = event.clientX;
        this.drag.lastClientY = event.clientY;

        for (const listener of this.panListeners) {
          listener(dx, dy);
        }
        break;
      }
      case 'float-move': {
        if (this.floating) {
          this.floating.x = point.x - this.drag.offsetX;
          this.floating.y = point.y - this.drag.offsetY;
          this.drawFloatingPreview();
        }
        break;
      }
      case 'float-scale': {
        this.scaleFloatingTo(point, this.drag.anchor, this.drag.aspect);
        break;
      }
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    this.finishDrag(true);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    this.finishDrag(false);
  };

  private readonly onPointerLeave = (): void => {
    this.emitCursor(null);
  };

  private finishDrag(commit: boolean): void {
    const drag = this.drag;

    this.drag = null;
    this.activePointerId = null;

    if (this.tool === 'pan') {
      this.overlay.style.cursor = 'grab';
    }

    if (!drag) {
      return;
    }

    switch (drag.kind) {
      case 'stroke': {
        this.recordHistory();
        break;
      }
      case 'shape': {
        this.clearOverlay();

        if (commit) {
          this.drawShape(this.ctx, drag);
          this.recordHistory();
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- Tool implementations -------------------------------------------------

  private stampSegment(from: Point, to: Point): void {
    const ctx = this.ctx;
    const radius = Math.max(this.toolSize / 2, 0.5);
    const isErase = this.drag?.kind === 'stroke' ? this.drag.erase : this.tool === 'eraser';

    ctx.save();
    ctx.fillStyle = isErase ? BACKGROUND_COLOR : this.color;

    for (const point of interpolateStroke(from, to, Math.max(radius * 0.4, 0.35))) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawShape(
    ctx: CanvasRenderingContext2D,
    shape: { tool: 'line' | 'rect' | 'ellipse'; start: Point; current: Point; shift: boolean },
  ): void {
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineWidth = this.toolSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shape.tool === 'line') {
      const end = shape.shift ? constrainLine(shape.start, shape.current) : shape.current;

      ctx.beginPath();
      ctx.moveTo(shape.start.x, shape.start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else {
      const rect = normalizeRect(shape.start, shape.current, shape.shift);

      ctx.beginPath();

      if (shape.tool === 'rect') {
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
      } else {
        ctx.ellipse(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          rect.width / 2,
          rect.height / 2,
          0,
          0,
          Math.PI * 2,
        );
      }

      if (this.shapeFill) {
        ctx.fill();
      } else {
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawShapePreview(): void {
    if (!this.drag || this.drag.kind !== 'shape') {
      return;
    }

    this.clearOverlay();
    this.drawShape(this.octx, this.drag);
  }

  private applyFill(point: Point): void {
    const rgba = hexToRgba(this.color);

    if (!rgba) {
      return;
    }

    const backingX = clamp(Math.floor(point.x * this.dpr), 0, this.canvas.width - 1);
    const backingY = clamp(Math.floor(point.y * this.dpr), 0, this.canvas.height - 1);
    const image = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    if (floodFill(image, backingX, backingY, rgba, DEFAULT_FILL_TOLERANCE)) {
      this.ctx.putImageData(image, 0, 0);
      this.recordHistory();
    }
  }

  private pickColor(point: Point): void {
    const backingX = clamp(Math.floor(point.x * this.dpr), 0, this.canvas.width - 1);
    const backingY = clamp(Math.floor(point.y * this.dpr), 0, this.canvas.height - 1);
    const pixel = this.ctx.getImageData(backingX, backingY, 1, 1).data;
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);

    this.color = hex;

    for (const listener of this.colorPickListeners) {
      listener(hex);
    }
  }

  // ---- Floating image -------------------------------------------------------

  private floatingHandles(floating: FloatingImage): Point[] {
    return [
      { x: floating.x, y: floating.y },
      { x: floating.x + floating.width, y: floating.y },
      { x: floating.x, y: floating.y + floating.height },
      { x: floating.x + floating.width, y: floating.y + floating.height },
    ];
  }

  private beginFloatingDrag(point: Point): void {
    const floating = this.floating;

    if (!floating) {
      return;
    }

    const grabRadius = (FLOATING_HANDLE_SCREEN_PX + 4) / this.zoom;
    const handles = this.floatingHandles(floating);

    for (let i = 0; i < handles.length; i += 1) {
      const handle = handles[i];

      if (Math.abs(point.x - handle.x) <= grabRadius && Math.abs(point.y - handle.y) <= grabRadius) {
        // Anchor is the corner opposite the grabbed handle.
        const anchor = handles[3 - i];

        this.drag = {
          kind: 'float-scale',
          anchor: { x: anchor.x, y: anchor.y },
          aspect: floating.aspect,
        };

        return;
      }
    }

    if (
      point.x >= floating.x &&
      point.x <= floating.x + floating.width &&
      point.y >= floating.y &&
      point.y <= floating.y + floating.height
    ) {
      this.drag = { kind: 'float-move', offsetX: point.x - floating.x, offsetY: point.y - floating.y };
    }
  }

  private scaleFloatingTo(point: Point, anchor: Point, aspect: number): void {
    const floating = this.floating;

    if (!floating) {
      return;
    }

    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    const minSide = 8;
    // Aspect-preserving: follow whichever axis is dragged further.
    const widthFromX = Math.abs(dx);
    const widthFromY = Math.abs(dy) * aspect;
    const width = Math.max(minSide, Math.max(widthFromX, widthFromY));
    const height = Math.max(minSide / Math.max(aspect, 0.0001), width / Math.max(aspect, 0.0001));

    floating.width = width;
    floating.height = height;
    floating.x = dx < 0 ? anchor.x - width : anchor.x;
    floating.y = dy < 0 ? anchor.y - height : anchor.y;
    this.drawFloatingPreview();
  }

  private drawFloatingPreview(): void {
    const floating = this.floating;

    if (!floating) {
      return;
    }

    const octx = this.octx;

    this.clearOverlay();
    octx.save();
    octx.drawImage(floating.source, floating.x, floating.y, floating.width, floating.height);

    const hairline = Math.max(1 / this.zoom, 0.25);

    octx.lineWidth = hairline;
    octx.strokeStyle = '#2f6fed';
    octx.setLineDash([6 / this.zoom, 4 / this.zoom]);
    octx.strokeRect(floating.x, floating.y, floating.width, floating.height);
    octx.setLineDash([]);

    const half = FLOATING_HANDLE_SCREEN_PX / this.zoom / 2;

    for (const handle of this.floatingHandles(floating)) {
      octx.fillStyle = '#ffffff';
      octx.fillRect(handle.x - half, handle.y - half, half * 2, half * 2);
      octx.strokeRect(handle.x - half, handle.y - half, half * 2, half * 2);
    }

    octx.restore();
  }
}

export function createPaintEngine(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement): PaintEngine {
  return new PaintEngine(canvas, overlay);
}
