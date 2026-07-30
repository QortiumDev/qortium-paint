// Shared contracts between the paint engine (src/engine), the UI shell
// (src/ui), and the QDN integration layer (src/qdn). Keep this file free of
// imports so every module can depend on it without cycles.

export type ToolId =
  | 'brush'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'fill'
  | 'text'
  | 'picker'
  | 'pan'
  | 'place';

export type ExportFormat = 'image/png' | 'image/jpeg';

export type EngineListener = (state: EngineState) => void;

export type EngineState = {
  canUndo: boolean;
  canRedo: boolean;
  canvasSize: { width: number; height: number };
  dirty: boolean;
  floatingImage: boolean;
  tool: ToolId;
  zoom: number;
};

export type PaintEngineApi = {
  clear(): void;
  commitFloatingImage(): void;
  discardFloatingImage(): void;
  exportBlob(format: ExportFormat, quality?: number): Promise<Blob>;
  getState(): EngineState;
  importImage(source: Blob): Promise<void>;
  loadSnapshot(dataUrl: string): Promise<void>;
  redo(): void;
  resizeCanvas(width: number, height: number): void;
  setColor(color: string): void;
  setTool(tool: ToolId): void;
  setToolSize(size: number): void;
  snapshotDataUrl(): string;
  subscribe(listener: EngineListener): () => void;
  undo(): void;
};

export type BridgeState = {
  actions: string[];
  bridged: boolean;
  publicNode: boolean;
};

export type AccountInfo = {
  address: string;
  name: string | null;
};

export type PublishImageParams = {
  blob: Blob;
  description: string;
  filename: string;
  identifier: string;
  name: string;
  service: 'IMAGE' | 'FILE';
  title: string;
};

export type PublishActionResult = {
  accepted: boolean;
  action: 'PUBLISH_QDN_RESOURCE';
  resource?: { identifier: string | null; name: string; service: string };
  result?: unknown;
  transactionSignature?: string;
};

export type QdnServicesApi = {
  getAccount(): Promise<AccountInfo | null>;
  getBridgeState(): Promise<BridgeState>;
  publishImage(params: PublishImageParams): Promise<PublishActionResult>;
  saveLocal(blob: Blob, filename: string): Promise<void>;
  suggestIdentifier(title: string, isoDate: string): string;
};
