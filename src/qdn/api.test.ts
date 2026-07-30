import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_IMAGE_BYTES,
  blobToBase64,
  qdnServices,
  sanitizeFilename,
  suggestIdentifier,
  validateIdentifier,
} from './api';

type BridgeHandler = (request: { action: string; [key: string]: unknown }) => Promise<unknown>;

const byteLength = (value: string) => new TextEncoder().encode(value).length;

function installBridge(handler: BridgeHandler) {
  const mock = vi.fn(handler);

  window.qdnRequest = mock as Window['qdnRequest'];

  return mock;
}

afterEach(() => {
  delete window.qdnRequest;
  vi.restoreAllMocks();
});

describe('suggestIdentifier', () => {
  it('slugs the title and appends the compact date', () => {
    expect(suggestIdentifier('Hello, World!', '2026-07-30')).toBe('paint-hello-world-20260730');
  });

  it('collapses repeated separators and trims edge hyphens', () => {
    expect(suggestIdentifier('  --Cool   Art--  ', '2026-07-30')).toBe('paint-cool-art-20260730');
  });

  it('drops multibyte characters (emoji) instead of letting them into the identifier', () => {
    const identifier = suggestIdentifier('🎨 Sunset 🌅 Painting', '2026-07-30');

    expect(identifier).toBe('paint-sunset-painting-20260730');
    expect(() => validateIdentifier(identifier)).not.toThrow();
  });

  it('handles a fully multibyte (Tibetan) title without breaking the shape', () => {
    const identifier = suggestIdentifier('བོད་ཡིག་རི་མོ', '2026-07-30');

    expect(identifier).toBe('paint-20260730');
    expect(() => validateIdentifier(identifier)).not.toThrow();
  });

  it('caps the whole identifier at 64 UTF-8 bytes without truncating the date', () => {
    const identifier = suggestIdentifier('x'.repeat(200), '2026-07-30');

    expect(byteLength(identifier)).toBeLessThanOrEqual(64);
    expect(identifier.startsWith('paint-')).toBe(true);
    expect(identifier.endsWith('-20260730')).toBe(true);
    expect(() => validateIdentifier(identifier)).not.toThrow();
  });

  it('never leaves a dangling hyphen when truncation lands on a word break', () => {
    const identifier = suggestIdentifier(`${'a'.repeat(48)} ${'b'.repeat(20)}`, '2026-07-30');

    expect(byteLength(identifier)).toBeLessThanOrEqual(64);
    expect(identifier).toBe(`paint-${'a'.repeat(48)}-20260730`);
  });

  it('preserves the date when the title is empty', () => {
    expect(suggestIdentifier('', '2026-07-30')).toBe('paint-20260730');
  });
});

describe('validateIdentifier', () => {
  it('accepts letters, digits, dots, underscores, and hyphens', () => {
    expect(() => validateIdentifier('paint-a_b.c-1')).not.toThrow();
  });

  it('rejects an empty identifier', () => {
    expect(() => validateIdentifier('')).toThrow(/empty/i);
  });

  it('rejects identifiers over 64 UTF-8 bytes, measured in bytes not characters', () => {
    expect(() => validateIdentifier('a'.repeat(65))).toThrow(/64/);
    // 22 Tibetan chars = 66 bytes even though .length is far under 64.
    const multibyte = 'ཀ'.repeat(22);
    expect(multibyte.length).toBeLessThanOrEqual(64);
    expect(() => validateIdentifier(multibyte)).toThrow(/64/);
  });

  it('rejects disallowed characters', () => {
    expect(() => validateIdentifier('has space')).toThrow(/letters, digits/i);
    expect(() => validateIdentifier('slash/inside')).toThrow(/letters, digits/i);
  });
});

describe('blobToBase64', () => {
  it('round-trips bytes without a data: URL prefix', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255, 66, 67]);
    const base64 = await blobToBase64(new Blob([bytes], { type: 'image/png' }));

    expect(base64.startsWith('data:')).toBe(false);
    expect(base64).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    expect(base64.length % 4).toBe(0);

    const decoded = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    expect([...decoded]).toEqual([...bytes]);
  });
});

describe('publishImage', () => {
  const baseParams = {
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    description: 'A test drawing',
    filename: 'drawing.png',
    identifier: 'paint-test-20260730',
    name: 'QuickMythril',
    service: 'IMAGE' as const,
    title: 'Test drawing',
  };

  it('sends PUBLISH_QDN_RESOURCE with inline base64 and the given service/filename', async () => {
    const mock = installBridge(async () => ({
      accepted: true,
      action: 'PUBLISH_QDN_RESOURCE',
    }));

    const result = await qdnServices.publishImage(baseParams);

    expect(result.accepted).toBe(true);
    expect(mock).toHaveBeenCalledTimes(1);

    const payload = mock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.action).toBe('PUBLISH_QDN_RESOURCE');
    expect(payload.service).toBe('IMAGE');
    expect(payload.filename).toBe('drawing.png');
    expect(payload.identifier).toBe('paint-test-20260730');
    expect(payload.name).toBe('QuickMythril');
    expect(payload.title).toBe('Test drawing');
    expect(payload.description).toBe('A test drawing');
    expect(typeof payload.base64).toBe('string');
    expect((payload.base64 as string).startsWith('data:')).toBe(false);
    expect(payload.base64).toBe(btoa('\u0001\u0002\u0003'));
  });

  it('rejects a blob over 5 MiB with a friendly message and never calls the bridge', async () => {
    const mock = installBridge(async () => ({ accepted: true }));
    const oversize = new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: 'image/png' });

    await expect(qdnServices.publishImage({ ...baseParams, blob: oversize })).rejects.toThrow(/5 MiB/);
    expect(mock).not.toHaveBeenCalled();
  });

  it('rejects invalid identifiers before touching the bridge', async () => {
    const mock = installBridge(async () => ({ accepted: true }));

    await expect(qdnServices.publishImage({ ...baseParams, identifier: '' })).rejects.toThrow(/empty/i);
    await expect(qdnServices.publishImage({ ...baseParams, identifier: 'bad identifier!' })).rejects.toThrow(
      /letters, digits/i,
    );
    await expect(
      qdnServices.publishImage({ ...baseParams, identifier: 'a'.repeat(65) }),
    ).rejects.toThrow(/64/);
    expect(mock).not.toHaveBeenCalled();
  });

  it("surfaces Home's rejection message verbatim", async () => {
    installBridge(async () => {
      throw new Error('User declined the publish request.');
    });

    await expect(qdnServices.publishImage(baseParams)).rejects.toThrow(
      'User declined the publish request.',
    );
  });
});

describe('getAccount', () => {
  it('returns null when the Home bridge is absent', async () => {
    expect(window.qdnRequest).toBeUndefined();
    await expect(qdnServices.getAccount()).resolves.toBeNull();
  });

  it('returns null when the action fails', async () => {
    installBridge(async () => {
      throw new Error('declined');
    });

    await expect(qdnServices.getAccount()).resolves.toBeNull();
  });

  it('maps GET_SELECTED_ACCOUNT to { address, name }', async () => {
    const mock = installBridge(async () => ({
      address: 'QexampleAddress123',
      avatarContract: null,
      avatarUrl: null,
      isUnlocked: true,
      name: 'QuickMythril',
    }));

    await expect(qdnServices.getAccount()).resolves.toEqual({
      address: 'QexampleAddress123',
      name: 'QuickMythril',
    });
    expect(mock).toHaveBeenCalledWith({ action: 'GET_SELECTED_ACCOUNT' });
  });

  it('maps a missing name to null', async () => {
    installBridge(async () => ({ address: 'QexampleAddress123', isUnlocked: true }));

    await expect(qdnServices.getAccount()).resolves.toEqual({
      address: 'QexampleAddress123',
      name: null,
    });
  });
});

describe('getBridgeState', () => {
  it('reports unbridged local development', async () => {
    const state = await qdnServices.getBridgeState();

    expect(state.bridged).toBe(false);
    expect(state.publicNode).toBe(false);
    expect(state.actions).toContain('SHOW_ACTIONS');
  });

  it('maps the bridged probe including IS_USING_PUBLIC_NODE', async () => {
    installBridge(async (request) => {
      switch (request.action) {
        case 'SHOW_ACTIONS':
          return ['SHOW_ACTIONS', 'WHICH_UI', 'PUBLISH_QDN_RESOURCE', 'GET_SELECTED_ACCOUNT'];
        case 'IS_USING_PUBLIC_NODE':
          return true;
        default:
          throw new Error(`Unexpected action ${request.action}`);
      }
    });

    await expect(qdnServices.getBridgeState()).resolves.toEqual({
      actions: ['SHOW_ACTIONS', 'WHICH_UI', 'PUBLISH_QDN_RESOURCE', 'GET_SELECTED_ACCOUNT'],
      bridged: true,
      publicNode: true,
    });
  });
});

describe('saveLocal', () => {
  it('creates, clicks, and cleans up an object-URL download anchor', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;

    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;

    const clicked: HTMLAnchorElement[] = [];
    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        const element = realCreateElement(tagName);

        if (tagName === 'a') {
          const anchor = element as HTMLAnchorElement;
          vi.spyOn(anchor, 'click').mockImplementation(() => {
            clicked.push(anchor);
          });
        }

        return element;
      });

    try {
      const blob = new Blob(['pixels'], { type: 'image/png' });

      await qdnServices.saveLocal(blob, 'my drawing');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(clicked).toHaveLength(1);
      const anchor = clicked[0]!;
      expect(anchor.getAttribute('href')).toBe('blob:mock-url');
      expect(anchor.download).toBe('my drawing.png');
      expect(anchor.isConnected).toBe(false);
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});

describe('sanitizeFilename', () => {
  it('replaces path separators and strips control characters', () => {
    expect(sanitizeFilename('..\\evil/name\u0000\u001f.png', 'image/png')).toBe('..-evil-name.png');
  });

  it('defaults the extension from the blob type', () => {
    expect(sanitizeFilename('drawing', 'image/png')).toBe('drawing.png');
    expect(sanitizeFilename('drawing', 'image/jpeg')).toBe('drawing.jpg');
    expect(sanitizeFilename('drawing.jpeg', 'image/jpeg')).toBe('drawing.jpeg');
    expect(sanitizeFilename('drawing.png', 'image/png')).toBe('drawing.png');
  });

  it('falls back to a usable name for empty or dot-only input', () => {
    expect(sanitizeFilename('', 'image/png')).toBe('untitled.png');
    expect(sanitizeFilename('..', 'image/png')).toBe('untitled.png');
  });
});
