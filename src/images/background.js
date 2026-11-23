/*
 * Removes a uniform background (white, black, grey or any other colour).
 * The background colour is estimated from the image border, then a flood fill
 * from the edges marks connected pixels close to that colour (allowing gentle
 * gradients and vignettes). Pixels are faded out with a soft edge.
 * Works in place on RGBA data; returns the detected background colour.
 */
export function removeBackgroundPixels(pixels, width, height) {
  const total = width * height;
  if (!total) return null;
  const border = [];
  const addBorder = (index) => {
    const offset = index * 4;
    if (pixels[offset + 3] > 0) border.push(index);
  };
  for (let x = 0; x < width; x++) {
    addBorder(x);
    addBorder((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    addBorder(y * width);
    addBorder(y * width + width - 1);
  }
  if (!border.length) return null;
  const median = (channel) => {
    const values = border.map((index) => pixels[index * 4 + channel]).sort((a, b) => a - b);
    return values[values.length >> 1];
  };
  const bg = [median(0), median(1), median(2)];
  const distance = (index) => {
    const offset = index * 4;
    return Math.max(
      Math.abs(pixels[offset] - bg[0]),
      Math.abs(pixels[offset + 1] - bg[1]),
      Math.abs(pixels[offset + 2] - bg[2])
    );
  };
  /*
   * Tolerance adapts to how noisy the border is, but stays within limits so
   * that the coin rim is not eaten when the coin touches the image edge.
   */
  const borderDistances = border.map(distance).sort((a, b) => a - b);
  const p75 = borderDistances[Math.floor(borderDistances.length * 0.75)] || 0;
  const tolerance = Math.max(24, Math.min(48, p75 + 16)),
    gradientLimit = tolerance * 1.5,
    stepLimit = 6;
  const seen = new Uint8Array(total),
    queue = new Int32Array(total),
    dist = new Uint8Array(total);
  let head = 0,
    tail = 0;
  for (let index = 0; index < total; index++) dist[index] = Math.min(255, distance(index));
  const near = (from, to) => {
    const a = from * 4,
      b = to * 4;
    return (
      Math.max(
        Math.abs(pixels[a] - pixels[b]),
        Math.abs(pixels[a + 1] - pixels[b + 1]),
        Math.abs(pixels[a + 2] - pixels[b + 2])
      ) <= stepLimit
    );
  };
  const accept = (index, from) => {
    if (seen[index]) return;
    const transparent = pixels[index * 4 + 3] === 0;
    if (
      !transparent &&
      dist[index] > tolerance &&
      !(from >= 0 && dist[index] <= gradientLimit && near(from, index))
    )
      return;
    seen[index] = 1;
    queue[tail++] = index;
  };
  for (const index of border) accept(index, -1);
  while (head < tail) {
    const index = queue[head++],
      x = index % width,
      y = (index / width) | 0;
    if (x > 0) accept(index - 1, index);
    if (x < width - 1) accept(index + 1, index);
    if (y > 0) accept(index - width, index);
    if (y < height - 1) accept(index + width, index);
  }
  const solid = tolerance * 0.6;
  for (let index = 0; index < total; index++) {
    if (!seen[index]) continue;
    const d = dist[index];
    pixels[index * 4 + 3] =
      d <= solid
        ? 0
        : Math.min(
            pixels[index * 4 + 3],
            Math.round(((d - solid) / (gradientLimit - solid)) * 255)
          );
  }
  return bg;
}
