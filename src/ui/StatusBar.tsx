import { useEffect, useState } from 'react';
import type { BridgeState, EngineState } from '../types';
import type { PaintEngine } from '../engine/engine';

type StatusBarProps = {
  bridge: BridgeState | null;
  engine: PaintEngine | null;
  state: EngineState | null;
};

export function StatusBar({ bridge, engine, state }: StatusBarProps) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!engine) {
      return;
    }

    return engine.onCursorMove(setCursor);
  }, [engine]);

  const bridgeLabel = bridge === null ? 'Detecting…' : bridge.bridged ? 'Home bridge' : 'Browser mode';
  const bridgeClass = bridge === null ? 'is-pending' : bridge.bridged ? 'is-bridged' : 'is-browser';

  return (
    <footer className="qp-statusbar">
      <span className="qp-status-item" title="Canvas size">
        {state ? `${state.canvasSize.width} × ${state.canvasSize.height}` : '—'}
      </span>
      <span className="qp-status-item" title="Zoom">
        {state ? `${Math.round(state.zoom * 100)}%` : '—'}
      </span>
      <span className="qp-status-item qp-status-cursor" title="Cursor position">
        {cursor ? `${cursor.x}, ${cursor.y}` : '—'}
      </span>
      <span className="qp-status-spacer" />
      {state?.dirty ? (
        <span className="qp-status-item qp-status-dirty" title="Unsaved changes">
          Unsaved changes
        </span>
      ) : null}
      <span className={`qp-chip ${bridgeClass}`} title="How this app is connected to Qortium">
        {bridgeLabel}
      </span>
    </footer>
  );
}
