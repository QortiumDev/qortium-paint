import { describe, expect, it } from 'vitest';
import { floodFill, type ImageDataLike, type Rgba } from './floodFill';

const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];
const RED: Rgba = [255, 0, 0, 255];

function makeImage(width: number, height: number, color: Rgba = WHITE): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = color[3];
  }

  return { data, width, height };
}

function setPixel(image: ImageDataLike, x: number, y: number, color: Rgba): void {
  const offset = (y * image.width + x) * 4;

  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}

function getPixel(image: ImageDataLike, x: number, y: number): Rgba {
  const offset = (y * image.width + x) * 4;

  return [image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3]];
}

describe('floodFill', () => {
  it('fills an enclosed region without leaking past the boundary', () => {
    // 7x7 white image with a black rectangle border from (1,1) to (5,5).
    const image = makeImage(7, 7);

    for (let x = 1; x <= 5; x += 1) {
      setPixel(image, x, 1, BLACK);
      setPixel(image, x, 5, BLACK);
    }

    for (let y = 1; y <= 5; y += 1) {
      setPixel(image, 1, y, BLACK);
      setPixel(image, 5, y, BLACK);
    }

    expect(floodFill(image, 3, 3, RED)).toBe(true);

    // Interior filled.
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 2; x <= 4; x += 1) {
        expect(getPixel(image, x, y)).toEqual(RED);
      }
    }

    // Border intact, exterior untouched.
    expect(getPixel(image, 1, 1)).toEqual(BLACK);
    expect(getPixel(image, 0, 0)).toEqual(WHITE);
    expect(getPixel(image, 6, 6)).toEqual(WHITE);
  });

  it('respects tolerance: near-target pixels fill, far ones do not', () => {
    const image = makeImage(3, 1, WHITE);

    // Middle pixel slightly off-white (within tolerance 24), right pixel far.
    setPixel(image, 1, 0, [240, 240, 240, 255]);
    setPixel(image, 2, 0, [200, 200, 200, 255]);

    expect(floodFill(image, 0, 0, RED, 24)).toBe(true);
    expect(getPixel(image, 0, 0)).toEqual(RED);
    expect(getPixel(image, 1, 0)).toEqual(RED);
    expect(getPixel(image, 2, 0)).toEqual([200, 200, 200, 255]);
  });

  it('does not leak through a diagonal-only gap (4-connectivity)', () => {
    // 4x4 white image split by a black anti-diagonal; the two white halves
    // touch only diagonally at each step.
    const image = makeImage(4, 4);

    setPixel(image, 3, 0, BLACK);
    setPixel(image, 2, 1, BLACK);
    setPixel(image, 1, 2, BLACK);
    setPixel(image, 0, 3, BLACK);

    expect(floodFill(image, 0, 0, RED)).toBe(true);

    // Upper-left half filled.
    expect(getPixel(image, 0, 0)).toEqual(RED);
    expect(getPixel(image, 1, 1)).toEqual(RED);

    // Lower-right half must remain white.
    expect(getPixel(image, 3, 1)).toEqual(WHITE);
    expect(getPixel(image, 2, 2)).toEqual(WHITE);
    expect(getPixel(image, 3, 3)).toEqual(WHITE);
  });

  it('is a no-op when the target already equals the fill color', () => {
    const image = makeImage(2, 2, RED);

    expect(floodFill(image, 0, 0, RED)).toBe(false);
    expect(getPixel(image, 1, 1)).toEqual(RED);
  });

  it('rejects out-of-bounds start coordinates', () => {
    const image = makeImage(2, 2);

    expect(floodFill(image, -1, 0, RED)).toBe(false);
    expect(floodFill(image, 2, 0, RED)).toBe(false);
    expect(floodFill(image, 0, 5, RED)).toBe(false);
    expect(getPixel(image, 0, 0)).toEqual(WHITE);
  });

  it('fills the whole image when nothing bounds the region', () => {
    const image = makeImage(5, 4);

    expect(floodFill(image, 2, 2, BLACK)).toBe(true);

    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        expect(getPixel(image, x, y)).toEqual(BLACK);
      }
    }
  });
});
