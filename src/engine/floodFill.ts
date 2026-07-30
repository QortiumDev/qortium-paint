// Pure scanline flood fill on raw RGBA pixel data. Deliberately free of any
// canvas/DOM dependency so it is unit-testable under jsdom: it accepts
// anything shaped like ImageData (real ImageData is structurally compatible).

export type ImageDataLike = {
  data: Uint8ClampedArray;
  height: number;
  width: number;
};

export type Rgba = readonly [number, number, number, number];

export const DEFAULT_FILL_TOLERANCE = 24;

// Fills the 4-connected region around (startX, startY) whose pixels are
// within `tolerance` (max per-channel difference, RGBA) of the start pixel,
// writing `fill`. Mutates `image.data` in place. Returns true when at least
// one pixel changed. Diagonal-only neighbors are NOT connected.
export function floodFill(
  image: ImageDataLike,
  startX: number,
  startY: number,
  fill: Rgba,
  tolerance: number = DEFAULT_FILL_TOLERANCE,
): boolean {
  const { data, width, height } = image;
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);

  if (width <= 0 || height <= 0 || x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) {
    return false;
  }

  const startOffset = (y0 * width + x0) * 4;
  const targetR = data[startOffset];
  const targetG = data[startOffset + 1];
  const targetB = data[startOffset + 2];
  const targetA = data[startOffset + 3];
  const [fillR, fillG, fillB, fillA] = fill;

  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) {
    return false;
  }

  const matches = (x: number, y: number): boolean => {
    const offset = (y * width + x) * 4;

    return (
      Math.abs(data[offset] - targetR) <= tolerance &&
      Math.abs(data[offset + 1] - targetG) <= tolerance &&
      Math.abs(data[offset + 2] - targetB) <= tolerance &&
      Math.abs(data[offset + 3] - targetA) <= tolerance
    );
  };

  const setPixel = (x: number, y: number) => {
    const offset = (y * width + x) * 4;

    data[offset] = fillR;
    data[offset + 1] = fillG;
    data[offset + 2] = fillB;
    data[offset + 3] = fillA;
  };

  // `visited` guards against re-processing when the fill color itself falls
  // within tolerance of the target color.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [y0 * width + x0];
  let changed = false;

  while (stack.length > 0) {
    const seed = stack.pop() as number;
    const y = Math.floor(seed / width);
    const seedX = seed % width;

    if (visited[seed] || !matches(seedX, y)) {
      continue;
    }

    // Walk left to the start of this horizontal span.
    let x = seedX;

    while (x > 0 && !visited[y * width + x - 1] && matches(x - 1, y)) {
      x -= 1;
    }

    // Fill rightward across the span, seeding the rows above and below once
    // per contiguous matching run (classic scanline).
    let spanAbove = false;
    let spanBelow = false;

    while (x < width && !visited[y * width + x] && matches(x, y)) {
      setPixel(x, y);
      visited[y * width + x] = 1;
      changed = true;

      if (y > 0) {
        const aboveMatches = !visited[(y - 1) * width + x] && matches(x, y - 1);

        if (aboveMatches && !spanAbove) {
          stack.push((y - 1) * width + x);
          spanAbove = true;
        } else if (!aboveMatches) {
          spanAbove = false;
        }
      }

      if (y < height - 1) {
        const belowMatches = !visited[(y + 1) * width + x] && matches(x, y + 1);

        if (belowMatches && !spanBelow) {
          stack.push((y + 1) * width + x);
          spanBelow = true;
        } else if (!belowMatches) {
          spanBelow = false;
        }
      }

      x += 1;
    }
  }

  return changed;
}
