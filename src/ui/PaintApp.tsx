import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  CloudUpload,
  Download,
  FolderOpen,
  Frame,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { BridgeState, EngineState, QdnServicesApi, ToolId } from '../types';
import { createPaintEngine, type PaintEngine } from '../engine/engine';
import { PublishDialog, ResizeDialog, SaveDialog } from './dialogs';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';

const AUTOSAVE_KEY = 'qortium-paint.autosave.v1';
const AUTOSAVE_DEBOUNCE_MS = 2000;
const TEXT_FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";

const TOOL_HOTKEYS: Record<string, ToolId> = {
  b: 'brush',
  e: 'eraser',
  l: 'line',
  r: 'rect',
  o: 'ellipse',
  f: 'fill',
  t: 'text',
  i: 'picker',
};

type DialogKind = 'save' | 'publish' | 'resize' | null;

function readAutosave(): string | null {
  try {
    return localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
}

function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;

  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

type TextEntryOverlayProps = {
  color: string;
  fontSize: number;
  onCancel: () => void;
  onCommit: (value: string) => void;
  x: number;
  y: number;
  zoom: number;
};

function TextEntryOverlay({ color, fontSize, onCancel, onCommit, x, y, zoom }: TextEntryOverlayProps) {
  const doneRef = useRef(false);

  return (
    <input
      type="text"
      className="qp-text-entry"
      autoFocus
      spellCheck={false}
      placeholder="Type, then press Enter"
      aria-label="Text to place on the canvas"
      style={{
        left: `${x * zoom}px`,
        top: `${y * zoom}px`,
        fontSize: `${Math.max(fontSize * zoom, 10)}px`,
        color,
        fontFamily: TEXT_FONT,
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          doneRef.current = true;
          onCommit(event.currentTarget.value);
        } else if (event.key === 'Escape') {
          doneRef.current = true;
          event.stopPropagation();
          onCancel();
        }
      }}
      onBlur={(event) => {
        if (!doneRef.current) {
          doneRef.current = true;
          onCommit(event.currentTarget.value);
        }
      }}
    />
  );
}

export function PaintApp({ qdn }: { qdn: QdnServicesApi }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [engine, setEngine] = useState<PaintEngine | null>(null);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [color, setColorState] = useState('#111111');
  const [toolSize, setToolSizeState] = useState(4);
  const [shapeFill, setShapeFillState] = useState(false);
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [textEntry, setTextEntry] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [restoreOffer, setRestoreOffer] = useState<string | null>(() => readAutosave());

  const textFontSize = Math.max(12, toolSize * 2);
  const canPublish = bridge?.actions.some((action) => action.toUpperCase() === 'PUBLISH_QDN_RESOURCE') ?? false;

  // ---- Engine lifecycle ----------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;

    if (!canvas || !overlay) {
      return;
    }

    const created = createPaintEngine(canvas, overlay);
    const scroller = scrollRef.current;

    const unsubscribers = [
      created.subscribe(setEngineState),
      created.onColorPick(setColorState),
      created.onTextRequest((position) => setTextEntry(position)),
      created.onPan((dx, dy) => {
        if (scroller) {
          scroller.scrollLeft -= dx;
          scroller.scrollTop -= dy;
        }
      }),
    ];

    setEngine(created);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      created.destroy();
      setEngine(null);
      setEngineState(null);
    };
  }, []);

  // ---- Bridge state chip ----------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    qdn
      .getBridgeState()
      .then((state) => {
        if (!cancelled) {
          setBridge(state);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBridge({ actions: [], bridged: false, publicNode: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qdn]);

  // ---- Crash-recovery autosave (single localStorage slot, debounced) --------

  useEffect(() => {
    if (!engine) {
      return;
    }

    let timer: number | undefined;

    const unsubscribe = engine.subscribe((state) => {
      if (!state.dirty) {
        // Cancel any pending write: a stale timer firing after save/publish
        // cleared the slot would recreate a misleading restore prompt.
        window.clearTimeout(timer);

        return;
      }

      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, engine.snapshotDataUrl());
        } catch {
          // Storage full/unavailable — autosave is best-effort.
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [engine]);

  // ---- Toast auto-dismiss ----------------------------------------------------

  useEffect(() => {
    if (toast === null) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 3000);

    return () => window.clearTimeout(timer);
  }, [toast]);

  // ---- Keyboard shortcuts ----------------------------------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!engine) {
        return;
      }

      if (event.key === 'Escape') {
        if (textEntry) {
          setTextEntry(null);
        } else if (saveMenuOpen) {
          setSaveMenuOpen(false);
        } else if (dialog) {
          setDialog(null);
        } else if (engineState?.floatingImage) {
          engine.discardFloatingImage();
        }

        return;
      }

      const editable = isEditableTarget(event.target);

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();

        if (key === 's') {
          event.preventDefault();
          setSaveMenuOpen(false);
          setDialog('save');

          return;
        }

        if (editable) {
          return; // Let inputs keep their native ctrl+z/y behavior.
        }

        if (key === 'z') {
          event.preventDefault();

          if (event.shiftKey) {
            engine.redo();
          } else {
            engine.undo();
          }
        } else if (key === 'y') {
          event.preventDefault();
          engine.redo();
        }

        return;
      }

      if (editable || dialog !== null) {
        return;
      }

      const tool = TOOL_HOTKEYS[event.key.toLowerCase()];

      if (tool) {
        engine.setTool(tool);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, engine, engineState, saveMenuOpen, textEntry]);

  // ---- Unsaved-changes guard --------------------------------------------------

  useEffect(() => {
    if (!engineState?.dirty) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);

    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [engineState?.dirty]);

  // ---- Image import (open / paste / drop) --------------------------------------

  const importFile = useCallback(
    (file: File | Blob | null | undefined) => {
      if (!engine || !file) {
        return;
      }

      if (file.type && !file.type.startsWith('image/')) {
        setToast('That file is not an image.');

        return;
      }

      engine.importImage(file).catch((error: unknown) => {
        setToast(error instanceof Error && error.message ? error.message : 'Could not open that image.');
      });
    },
    [engine],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (dialog !== null || textEntry !== null || isEditableTarget(event.target)) {
        return;
      }

      const items = event.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();

          if (file) {
            event.preventDefault();
            importFile(file);
          }

          return;
        }
      }
    };

    window.addEventListener('paste', onPaste);

    return () => window.removeEventListener('paste', onPaste);
  }, [dialog, importFile, textEntry]);

  // ---- Ctrl+wheel zoom ----------------------------------------------------------

  useEffect(() => {
    const scroller = scrollRef.current;

    if (!scroller || !engine) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();

      if (event.deltaY < 0) {
        engine.zoomIn();
      } else if (event.deltaY > 0) {
        engine.zoomOut();
      }
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });

    return () => scroller.removeEventListener('wheel', onWheel);
  }, [engine]);

  // ---- UI event handlers -----------------------------------------------------------

  const handleToolChange = (tool: ToolId) => engine?.setTool(tool);

  const handleColorChange = (nextColor: string) => {
    setColorState(nextColor);
    engine?.setColor(nextColor);
  };

  const handleToolSizeChange = (size: number) => {
    setToolSizeState(size);
    engine?.setToolSize(size);
  };

  const handleShapeFillChange = (fill: boolean) => {
    setShapeFillState(fill);
    engine?.setShapeFill(fill);
  };

  const handleTextCommit = (value: string) => {
    if (engine && textEntry && value.trim()) {
      engine.drawText(value, textEntry.x, textEntry.y, TEXT_FONT, textFontSize, color);
    }

    setTextEntry(null);
  };

  const handleRestore = () => {
    if (engine && restoreOffer) {
      engine
        .loadSnapshot(restoreOffer)
        .then(() => setToast('Previous drawing restored.'))
        .catch(() => setToast('Could not restore the previous drawing.'));
    }

    setRestoreOffer(null);
  };

  const handleDiscardRestore = () => {
    clearAutosave();
    setRestoreOffer(null);
  };

  const zoomPercent = engineState ? `${Math.round(engineState.zoom * 100)}%` : '100%';

  return (
    <div className="qp-app">
      <header className="qp-topbar">
        <div className="qp-topbar-group qp-brand">
          <h1 className="qp-title">Paint</h1>
          <span className="qp-version">{__APP_VERSION__}</span>
        </div>

        <div className="qp-topbar-group">
          <button
            type="button"
            className="qp-icon-btn"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={!engineState?.canUndo}
            onClick={() => engine?.undo()}
          >
            <Undo2 size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="qp-icon-btn"
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            disabled={!engineState?.canRedo}
            onClick={() => engine?.redo()}
          >
            <Redo2 size={16} aria-hidden />
          </button>
        </div>

        <div className="qp-topbar-group">
          <button
            type="button"
            className="qp-icon-btn"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => engine?.zoomOut()}
          >
            <ZoomOut size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="qp-btn qp-zoom-label"
            title="Reset zoom to 100%"
            onClick={() => engine?.setZoom(1)}
          >
            {zoomPercent}
          </button>
          <button
            type="button"
            className="qp-icon-btn"
            title="Zoom in (Ctrl+scroll)"
            aria-label="Zoom in"
            onClick={() => engine?.zoomIn()}
          >
            <ZoomIn size={16} aria-hidden />
          </button>
        </div>

        <div className="qp-topbar-group">
          <button type="button" className="qp-btn" title="Change canvas size" onClick={() => setDialog('resize')}>
            <Frame size={15} aria-hidden />
            <span>Canvas…</span>
          </button>
          <button
            type="button"
            className="qp-btn"
            title="Open an image file (placed as a floating image)"
            onClick={() => fileInputRef.current?.click()}
          >
            <FolderOpen size={15} aria-hidden />
            <span>Open</span>
          </button>

          <div className="qp-menu-anchor">
            <button
              type="button"
              className="qp-btn qp-btn-primary"
              aria-haspopup="menu"
              aria-expanded={saveMenuOpen}
              onClick={() => setSaveMenuOpen((open) => !open)}
            >
              <Save size={15} aria-hidden />
              <span>Save</span>
              <ChevronDown size={13} aria-hidden />
            </button>
            {saveMenuOpen ? (
              <>
                <div className="qp-menu-backdrop" onClick={() => setSaveMenuOpen(false)} />
                <div className="qp-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSaveMenuOpen(false);
                      setDialog('save');
                    }}
                  >
                    <Download size={14} aria-hidden />
                    <span>Save to computer… (Ctrl+S)</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!canPublish}
                    title={
                      canPublish
                        ? undefined
                        : 'Publishing requires the Qortium Home bridge (PUBLISH_QDN_RESOURCE not available here)'
                    }
                    onClick={() => {
                      setSaveMenuOpen(false);
                      setDialog('publish');
                    }}
                  >
                    <CloudUpload size={14} aria-hidden />
                    <span>Publish to QDN…</span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <Toolbar
        color={color}
        onColorChange={handleColorChange}
        onShapeFillChange={handleShapeFillChange}
        onToolChange={handleToolChange}
        onToolSizeChange={handleToolSizeChange}
        shapeFill={shapeFill}
        tool={engineState?.tool ?? 'brush'}
        toolSize={toolSize}
      />

      <main className="qp-canvas-area">
        {restoreOffer ? (
          <div className="qp-banner qp-restore-banner">
            <RotateCcw size={14} aria-hidden />
            <span>An unsaved drawing from a previous session was found.</span>
            <button type="button" className="qp-btn qp-btn-small qp-btn-primary" onClick={handleRestore}>
              Restore
            </button>
            <button type="button" className="qp-btn qp-btn-small" onClick={handleDiscardRestore}>
              Discard
            </button>
          </div>
        ) : null}

        {engineState?.floatingImage ? (
          <div className="qp-banner qp-float-banner">
            <span>Placing image — drag to move, drag a corner to resize.</span>
            <button
              type="button"
              className="qp-btn qp-btn-small qp-btn-primary"
              onClick={() => engine?.commitFloatingImage()}
            >
              <Check size={14} aria-hidden />
              <span>Apply</span>
            </button>
            <button
              type="button"
              className="qp-btn qp-btn-small"
              title="Discard (Esc)"
              onClick={() => engine?.discardFloatingImage()}
            >
              <X size={14} aria-hidden />
              <span>Cancel</span>
            </button>
          </div>
        ) : null}

        <div
          className="qp-canvas-scroll"
          ref={scrollRef}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            importFile(event.dataTransfer.files?.[0]);
          }}
        >
          <div className="qp-canvas-wrap">
            <canvas ref={canvasRef} className="qp-canvas-main" />
            <canvas ref={overlayRef} className="qp-canvas-overlay" />
            {textEntry && engineState ? (
              <TextEntryOverlay
                color={color}
                fontSize={textFontSize}
                onCancel={() => setTextEntry(null)}
                onCommit={handleTextCommit}
                x={textEntry.x}
                y={textEntry.y}
                zoom={engineState.zoom}
              />
            ) : null}
          </div>
        </div>

        {toast ? <div className="qp-toast">{toast}</div> : null}
      </main>

      <StatusBar bridge={bridge} engine={engine} state={engineState} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          importFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {dialog === 'save' && engine ? (
        <SaveDialog
          engine={engine}
          qdn={qdn}
          onClose={() => setDialog(null)}
          onSaved={() => {
            clearAutosave();
            setToast('Saved.');
          }}
        />
      ) : null}

      {dialog === 'publish' && engine ? (
        <PublishDialog
          engine={engine}
          qdn={qdn}
          onClose={() => setDialog(null)}
          onPublished={() => {
            clearAutosave();
          }}
        />
      ) : null}

      {dialog === 'resize' && engineState ? (
        <ResizeDialog
          width={engineState.canvasSize.width}
          height={engineState.canvasSize.height}
          onApply={(width, height) => engine?.resizeCanvas(width, height)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
