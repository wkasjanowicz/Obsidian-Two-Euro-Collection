'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

/* Synthetic coin photos: a round coin on a uniform or graded background. */
function makeImage(size, background, coin, radius) {
  let seed = 7;
  const noise = (value, amount) => {
    seed = (seed * 16807) % 2147483647;
    return Math.max(0, Math.min(255, value + ((seed / 2147483647) * 2 - 1) * amount));
  };
  const pixels = new Uint8ClampedArray(size * size * 4);
  const isCoin = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x,
        d = Math.hypot(x - size / 2, y - size / 2),
        inside = d < radius,
        [r, g, b] = inside ? coin(x, y, d) : background(x, y, d);
      isCoin[i] = inside ? 1 : 0;
      pixels[i * 4] = noise(r, 6);
      pixels[i * 4 + 1] = noise(g, 6);
      pixels[i * 4 + 2] = noise(b, 6);
      pixels[i * 4 + 3] = 255;
    }
  return { pixels, isCoin };
}

function measure({ pixels, isCoin }) {
  let bgClear = 0,
    bgTotal = 0,
    coinKept = 0,
    coinTotal = 0;
  for (let i = 0; i < isCoin.length; i++) {
    if (isCoin[i]) {
      coinTotal++;
      if (pixels[i * 4 + 3] > 200) coinKept++;
    } else {
      bgTotal++;
      if (pixels[i * 4 + 3] < 30) bgClear++;
    }
  }
  return { background: bgClear / bgTotal, coin: coinKept / coinTotal };
}

const silver = (x, y, d) => {
  const v = d > 114 ? 70 : 150 + 40 * Math.sin(x / 7) * Math.cos(y / 9);
  return [v, v, v + 5];
};
const bimetal = (x, y, d) => (d < 80 ? [200, 170, 90] : [185, 185, 190]);

test('removeBackgroundPixels', async (t) => {
  const { removeBackgroundPixels } = await import('../src/images/background.js');
  const cases = {
    'black background': makeImage(300, () => [12, 12, 12], silver, 120),
    'white background': makeImage(300, () => [245, 245, 245], bimetal, 120),
    'grey background': makeImage(300, () => [128, 128, 130], bimetal, 120),
    'vignette (dark grey to black)': makeImage(
      300,
      (x, y, d) => [50 - d / 5, 50 - d / 5, 50 - d / 5],
      silver,
      120
    ),
    'coin touching the edges': makeImage(300, () => [10, 10, 10], silver, 150),
  };
  for (const [name, image] of Object.entries(cases)) {
    await t.test(name, () => {
      removeBackgroundPixels(image.pixels, 300, 300);
      const result = measure(image);
      assert.ok(result.background > 0.98, `background removed: ${result.background}`);
      assert.ok(result.coin > 0.99, `coin kept: ${result.coin}`);
    });
  }
});
