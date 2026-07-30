import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, MAX_IMPORT_PIXELS, validateDecodedSize, validateImportBlob } from './engine';

describe('validateImportBlob', () => {
  it('accepts a normal PNG', () => {
    expect(() => validateImportBlob({ size: 1024, type: 'image/png' })).not.toThrow();
  });

  it('rejects blobs over the byte limit', () => {
    expect(() => validateImportBlob({ size: MAX_IMPORT_BYTES + 1, type: 'image/png' })).toThrow(/import limit/);
  });

  it('accepts a blob exactly at the byte limit', () => {
    expect(() => validateImportBlob({ size: MAX_IMPORT_BYTES, type: 'image/png' })).not.toThrow();
  });

  it('rejects SVG', () => {
    expect(() => validateImportBlob({ size: 10, type: 'image/svg+xml' })).toThrow(/Unsupported image format/);
  });

  it('rejects an empty MIME type', () => {
    expect(() => validateImportBlob({ size: 10, type: '' })).toThrow(/Unsupported image format/);
  });

  it('rejects non-image MIME types', () => {
    expect(() => validateImportBlob({ size: 10, type: 'text/html' })).toThrow(/Unsupported image format/);
  });
});

describe('validateDecodedSize', () => {
  it('accepts normal dimensions', () => {
    expect(() => validateDecodedSize(1024, 768)).not.toThrow();
  });

  it('accepts dimensions exactly at the pixel cap', () => {
    expect(() => validateDecodedSize(8192, MAX_IMPORT_PIXELS / 8192)).not.toThrow();
  });

  it('rejects dimensions over the pixel cap', () => {
    expect(() => validateDecodedSize(8192, MAX_IMPORT_PIXELS / 8192 + 1)).toThrow(/too large/);
  });

  it('rejects zero or negative dimensions', () => {
    expect(() => validateDecodedSize(0, 100)).toThrow(/too large/);
    expect(() => validateDecodedSize(100, -1)).toThrow(/too large/);
  });
});
