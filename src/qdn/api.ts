// QDN integration layer for Paint. Implements the frozen QdnServicesApi
// contract from src/types.ts on top of the low-level bridge wrapper in
// src/qdn/qdnRequest.ts. Home injects window.qdnRequest, shows its own
// approval prompt, and signs — this app never touches keys.

import type {
  AccountInfo,
  BridgeState,
  PublishActionResult,
  PublishImageParams,
  QdnServicesApi,
} from '../types';
import { getBridgeState as getWrapperBridgeState, qdnRequest } from './qdnRequest';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IDENTIFIER_BYTES = 64;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]+$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

const textEncoder = new TextEncoder();

function utf8ByteLength(value: string) {
  return textEncoder.encode(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Throws a descriptive Error when the identifier is unusable for QDN. */
export function validateIdentifier(identifier: string): void {
  if (!identifier) {
    throw new Error('The QDN identifier must not be empty.');
  }

  const byteLength = utf8ByteLength(identifier);

  if (byteLength > MAX_IDENTIFIER_BYTES) {
    throw new Error(
      `The QDN identifier is ${byteLength} bytes; identifiers are limited to ${MAX_IDENTIFIER_BYTES} bytes.`,
    );
  }

  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(
      'The QDN identifier may only contain letters, digits, dots, underscores, and hyphens.',
    );
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }

  // Older WebView fallback: FileReader gives us the same bytes.
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image data.'));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

/** Raw base64 (no data: URL prefix), as PUBLISH_QDN_RESOURCE expects. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const base64 = bytesToBase64(await blobBytes(blob));

  if (base64.length % 4 !== 0 || !BASE64_PATTERN.test(base64)) {
    throw new Error('Image encoding produced invalid base64 data.');
  }

  return base64;
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

/** Strips path separators and control characters; adds an extension from the blob type when missing. */
export function sanitizeFilename(filename: string, blobType: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = filename.replace(/[/\\]/g, '-').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const base = cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'untitled';
  const defaultExtension = EXTENSION_BY_TYPE[blobType] ?? '';

  if (defaultExtension && !base.toLowerCase().endsWith('.png') && !base.toLowerCase().endsWith('.jpg') && !base.toLowerCase().endsWith('.jpeg')) {
    return `${base}${defaultExtension}`;
  }

  return base;
}

/**
 * Builds `paint-<slug>-<yyyymmdd>` from a drawing title and an ISO date like
 * '2026-07-30'. The slug is lowercase ASCII alphanumerics and hyphens; the
 * whole identifier is trimmed (slug first, never the date) so its UTF-8 byte
 * length stays within the 64-byte QDN identifier limit.
 */
export function suggestIdentifier(title: string, isoDate: string): string {
  const datePart = isoDate.replace(/-/g, '');
  const suffix = `-${datePart}`;

  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const maxSlugBytes = MAX_IDENTIFIER_BYTES - utf8ByteLength('paint-') - utf8ByteLength(suffix);

  while (slug && utf8ByteLength(slug) > maxSlugBytes) {
    slug = slug.slice(0, -1);
  }

  slug = slug.replace(/-+$/, '');

  return slug ? `paint-${slug}${suffix}` : `paint${suffix}`;
}

async function getAccount(): Promise<AccountInfo | null> {
  try {
    const account = await qdnRequest<unknown>({ action: 'GET_SELECTED_ACCOUNT' });

    if (!isRecord(account) || typeof account.address !== 'string' || !account.address) {
      return null;
    }

    return {
      address: account.address,
      name: typeof account.name === 'string' && account.name ? account.name : null,
    };
  } catch {
    // Unbridged (browser dev) or the action failed/was declined — the UI
    // treats a missing account the same way either way.
    return null;
  }
}

async function getBridgeState(): Promise<BridgeState> {
  const wrapperState = await getWrapperBridgeState();
  let publicNode = false;

  try {
    publicNode = Boolean(await qdnRequest<unknown>({ action: 'IS_USING_PUBLIC_NODE' }));
  } catch {
    // Unbridged development is always a local read-only node.
  }

  return {
    actions: wrapperState.actions,
    bridged: wrapperState.isHomeBridge,
    publicNode,
  };
}

async function publishImage(params: PublishImageParams): Promise<PublishActionResult> {
  validateIdentifier(params.identifier);

  if (params.blob.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `This image is ${params.blob.size.toLocaleString()} bytes; QDN publishes from Paint are limited to 5 MiB (${MAX_IMAGE_BYTES.toLocaleString()} bytes). Try exporting as JPEG or shrinking the canvas.`,
    );
  }

  const base64 = await blobToBase64(params.blob);

  try {
    return await qdnRequest<PublishActionResult>({
      action: 'PUBLISH_QDN_RESOURCE',
      base64,
      description: params.description,
      filename: params.filename,
      identifier: params.identifier,
      name: params.name,
      service: params.service,
      title: params.title,
    });
  } catch (error) {
    // Surface Home's rejection message verbatim.
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
  }
}

// SAVE_QDN_RESOURCE only saves an already-published resource to disk, so a
// fresh drawing is saved with a plain browser download instead.
async function saveLocal(blob: Blob, filename: string): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = sanitizeFilename(filename, blob.type);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const qdnServices: QdnServicesApi = {
  getAccount,
  getBridgeState,
  publishImage,
  saveLocal,
  suggestIdentifier,
};
