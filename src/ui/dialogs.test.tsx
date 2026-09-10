import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublishDialog, SaveDialog } from './dialogs';
import type { PaintEngine } from '../engine/engine';
import type { QdnServicesApi } from '../types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function makeEngine() {
  return {
    exportBlob: vi.fn().mockResolvedValue(new Blob(['pixels'], { type: 'image/png' })),
    markClean: vi.fn(),
  } as unknown as PaintEngine & { exportBlob: ReturnType<typeof vi.fn>; markClean: ReturnType<typeof vi.fn> };
}

function makeQdn(account: { address: string; name: string | null } | null, publishImage: QdnServicesApi['publishImage']) {
  return {
    getAccount: vi.fn().mockResolvedValue(account),
    getBridgeState: vi.fn().mockResolvedValue({ actions: [], bridged: true, publicNode: false }),
    publishImage,
    saveLocal: vi.fn().mockResolvedValue(undefined),
    suggestIdentifier: vi.fn((title: string) => title.trim().toLowerCase().replace(/\s+/g, '-')),
  } satisfies QdnServicesApi;
}

let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

async function mount(qdn: QdnServicesApi, engine = makeEngine()) {
  const node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<PublishDialog engine={engine} onClose={vi.fn()} onPublished={vi.fn()} qdn={qdn} />));
  return { engine, node };
}

async function enterTitle(node: HTMLElement, title: string) {
  const input = node.querySelector('input[type="text"]') as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, title);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function publishButton(node: HTMLElement) {
  return node.querySelector('button[type="submit"]') as HTMLButtonElement;
}

describe('PublishDialog', () => {
  it('requires a selected registered name before allowing publish', async () => {
    const publishImage = vi.fn();
    const qdn = makeQdn({ address: 'Qabc', name: null }, publishImage);
    const { node, engine } = await mount(qdn);

    await enterTitle(node, 'A drawing');
    expect(node.textContent).toContain('You must be signed in');
    expect(publishButton(node).disabled).toBe(true);
    expect(publishImage).not.toHaveBeenCalled();
    expect(engine.markClean).not.toHaveBeenCalled();
  });

  it.each([
    ['denies an unapproved publish', false],
    ['keeps the drawing dirty when publishing throws', true],
  ])('%s', async (_label, throws) => {
    const publishImage = throws
      ? vi.fn().mockRejectedValue(new Error('bridge unavailable'))
      : vi.fn().mockResolvedValue({ accepted: false, action: 'PUBLISH_QDN_RESOURCE' as const });
    const qdn = makeQdn({ address: 'Qabc', name: 'Alice' }, publishImage);
    const onPublished = vi.fn();
    const engine = makeEngine();
    const node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
    await act(async () => root!.render(<PublishDialog engine={engine} onClose={vi.fn()} onPublished={onPublished} qdn={qdn} />));
    await enterTitle(node, 'A drawing');

    await act(async () => publishButton(node).click());
    expect(publishImage).toHaveBeenCalledTimes(1);
    expect(engine.markClean).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
    expect(node.querySelector('.qp-error')?.textContent).toMatch(/not approved|bridge unavailable/);
  });

  it('marks the engine clean and reports the resource after acceptance', async () => {
    const publishImage = vi.fn().mockResolvedValue({
      accepted: true,
      action: 'PUBLISH_QDN_RESOURCE' as const,
      resource: { identifier: 'a-drawing', name: 'Alice', service: 'IMAGE' },
    });
    const qdn = makeQdn({ address: 'Qabc', name: 'Alice' }, publishImage);
    const onPublished = vi.fn();
    const onClose = vi.fn();
    const engine = makeEngine();
    const node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
    await act(async () => root!.render(<PublishDialog engine={engine} onClose={onClose} onPublished={onPublished} qdn={qdn} />));
    await enterTitle(node, 'A drawing');

    await act(async () => publishButton(node).click());
    expect(publishImage).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice', title: 'A drawing', identifier: 'a-drawing', service: 'IMAGE', blob: expect.any(Blob) }));
    expect(engine.markClean).toHaveBeenCalledTimes(1);
    expect(onPublished).toHaveBeenCalledTimes(1);
    expect(node.textContent).toContain('Published as a-drawing under Alice');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SaveDialog', () => {
  it('keeps the engine dirty after requesting a local download', async () => {
    const engine = makeEngine();
    const onSaved = vi.fn();
    const qdn = makeQdn(null, vi.fn());
    qdn.saveLocal = vi.fn().mockResolvedValue(undefined);
    const node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);

    await act(async () => root!.render(<SaveDialog engine={engine} onClose={vi.fn()} onSaved={onSaved} qdn={qdn} />));
    await act(async () => (node.querySelector('button[type="submit"]') as HTMLButtonElement).click());

    expect(qdn.saveLocal).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.png$/));
    expect(engine.markClean).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
