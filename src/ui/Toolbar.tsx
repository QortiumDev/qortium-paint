import {
  Brush,
  Circle,
  Eraser,
  Hand,
  PaintBucket,
  Pipette,
  Slash,
  Square,
  Type,
} from 'lucide-react';
import type { ToolId } from '../types';

export const PALETTE: readonly string[] = [
  '#000000',
  '#7f7f7f',
  '#880015',
  '#ed1c24',
  '#ff7f27',
  '#fff200',
  '#22b14c',
  '#00a2e8',
  '#3f48cc',
  '#a349a4',
  '#ffffff',
  '#c3c3c3',
  '#b97a57',
  '#ffaec9',
  '#ffc90e',
  '#efe4b0',
];

const TOOLS: { id: ToolId; label: string; hotkey: string | null; Icon: typeof Brush }[] = [
  { id: 'brush', label: 'Brush', hotkey: 'B', Icon: Brush },
  { id: 'eraser', label: 'Eraser', hotkey: 'E', Icon: Eraser },
  { id: 'line', label: 'Line', hotkey: 'L', Icon: Slash },
  { id: 'rect', label: 'Rectangle', hotkey: 'R', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', hotkey: 'O', Icon: Circle },
  { id: 'fill', label: 'Fill', hotkey: 'F', Icon: PaintBucket },
  { id: 'text', label: 'Text', hotkey: 'T', Icon: Type },
  { id: 'picker', label: 'Pick color', hotkey: 'I', Icon: Pipette },
  { id: 'pan', label: 'Pan', hotkey: null, Icon: Hand },
];

type ToolbarProps = {
  color: string;
  onColorChange: (color: string) => void;
  onShapeFillChange: (fill: boolean) => void;
  onToolChange: (tool: ToolId) => void;
  onToolSizeChange: (size: number) => void;
  shapeFill: boolean;
  tool: ToolId;
  toolSize: number;
};

export function Toolbar({
  color,
  onColorChange,
  onShapeFillChange,
  onToolChange,
  onToolSizeChange,
  shapeFill,
  tool,
  toolSize,
}: ToolbarProps) {
  return (
    <aside className="qp-toolbar" aria-label="Tools">
      <div className="qp-tool-grid" role="group" aria-label="Drawing tools">
        {TOOLS.map(({ id, label, hotkey, Icon }) => (
          <button
            key={id}
            type="button"
            className={`qp-icon-btn qp-tool-btn${tool === id ? ' is-active' : ''}`}
            title={hotkey ? `${label} (${hotkey})` : label}
            aria-label={hotkey ? `${label} (${hotkey})` : label}
            aria-pressed={tool === id}
            onClick={() => onToolChange(id)}
          >
            <Icon size={17} strokeWidth={2} aria-hidden />
          </button>
        ))}
      </div>

      <div className="qp-divider" />

      <label className="qp-fill-toggle" title="Fill rectangles and ellipses instead of outlining them">
        <input type="checkbox" checked={shapeFill} onChange={(event) => onShapeFillChange(event.target.checked)} />
        <span>Fill shapes</span>
      </label>

      <div className="qp-size-block">
        <div className="qp-size-row">
          <span className="qp-size-label">Size</span>
          <span className="qp-size-value">{toolSize}</span>
        </div>
        <input
          type="range"
          min={1}
          max={64}
          step={1}
          value={toolSize}
          aria-label="Brush size"
          onChange={(event) => onToolSizeChange(Number(event.target.value))}
        />
        <div className="qp-size-preview" aria-hidden>
          <span
            className="qp-size-dot"
            style={{
              width: `${Math.min(toolSize, 30)}px`,
              height: `${Math.min(toolSize, 30)}px`,
              background: color,
            }}
          />
        </div>
      </div>

      <div className="qp-divider" />

      <div className="qp-palette" role="group" aria-label="Color palette">
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`qp-swatch${color.toLowerCase() === swatch ? ' is-active' : ''}`}
            style={{ background: swatch }}
            title={swatch}
            aria-label={`Color ${swatch}`}
            onClick={() => onColorChange(swatch)}
          />
        ))}
      </div>

      <label className="qp-color-input" title="Custom color">
        <input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} aria-label="Custom color" />
        <span className="qp-color-hex">{color}</span>
      </label>
    </aside>
  );
}
