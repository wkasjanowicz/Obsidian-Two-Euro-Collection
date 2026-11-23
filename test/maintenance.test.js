'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin, coinNote } = require('./helpers/load-plugin');

const fakeCanvas = (supportsWebp = true) => ({
  width: 10,
  height: 10,
  toBlob: (callback, type) =>
    callback({
      type: type === 'image/webp' && supportsWebp ? 'image/webp' : 'image/png',
      arrayBuffer: async () => new ArrayBuffer(100),
    }),
});

test('maintenance and images', async (t) => {
  await t.test('dedupe keeps the owned coin and carries over the Numista id', async () => {
    const { plugin, vault } = await createPlugin({
      files: {
        '2 Euro/Coins/France/mine.md': coinNote({
          country: 'France',
          year: '2025',
          title: '2 Euro (Notre-Dame de Paris)',
          owned: true,
        }),
        '2 Euro/Coins/France/synced.md': coinNote({
          country: 'France',
          year: '2025',
          title: '2 Euro (Notre Dame de Paris)',
          numista_id: '999',
          numista_issue_id: '5',
        }),
      },
    });
    const removed = await plugin.dedupe();
    assert.equal(removed, 1);
    assert.deepEqual(vault.trashed, ['2 Euro/Coins/France/synced.md']);
    assert.equal(plugin.getRows()[0].numista_id, '999');
  });

  await t.test('processed covers are saved as WebP and replace the old PNG', async () => {
    const { plugin, vault } = await createPlugin({
      files: {
        '2 Euro/Coins/Finland/a.md': coinNote({
          country: 'Finland',
          year: '2025',
          title: '2 Euro Diplomacy',
          coin_type: 'commemorative',
          cover: '[[2 Euro/Covers/Finland-2025-Comm-Diplomacy.png]]',
        }),
        '2 Euro/Covers/Finland-2025-Comm-Diplomacy.png': new ArrayBuffer(4000),
        '2 Euro/Covers/numista-1-2.jpg': new ArrayBuffer(10),
      },
    });
    const row = plugin.getRows()[0];
    const path = await plugin.saveProcessedCover(row, fakeCanvas());
    assert.equal(path, '2 Euro/Covers/Finland-2025-Comm-Diplomacy.webp');
    assert.deepEqual(vault.trashed, ['2 Euro/Covers/Finland-2025-Comm-Diplomacy.png']);
    assert.ok(vault.files.has('2 Euro/Covers/numista-1-2.jpg'), 'original download is kept');
  });

  await t.test('falls back to PNG where WebP encoding is unavailable', async () => {
    const { plugin } = await createPlugin({
      files: { '2 Euro/Coins/a.md': coinNote({ country: 'Malta', year: '2025', title: 'X' }) },
    });
    const path = await plugin.saveProcessedCover(plugin.getRows()[0], fakeCanvas(false));
    assert.match(path, /\.png$/);
  });

  await t.test(
    'batch processing defaults to background removal and clears the selection',
    async () => {
      const { plugin } = await createPlugin({
        files: {
          '2 Euro/Coins/a.md': coinNote({ country: 'Malta', year: '2025', title: 'A' }),
          '2 Euro/Coins/b.md': coinNote({ country: 'Malta', year: '2025', title: 'B' }),
        },
      });
      const used = [];
      plugin.processBackgroundForRow = async () => (used.push('background'), { ok: true });
      plugin.processCatalogPresetForRow = async () => (
        used.push('catalog'),
        { ok: true, override: {} }
      );
      plugin.selectedCoinPaths = new Set(plugin.getRows().map((row) => row.file.path));
      await plugin.processSelectedImages(undefined);
      assert.deepEqual(used, ['background', 'background']);
      assert.equal(plugin.selectedCoinPaths.size, 0);
    }
  );

  await t.test('PNG covers are converted to WebP for every coin that uses them', async () => {
    const { plugin, vault } = await createPlugin({
      files: {
        '2 Euro/Coins/a.md': coinNote(
          { country: 'Malta', year: '2025', title: 'A', cover: '[[2 Euro/Covers/A.png]]' },
          '\n![[2 Euro/Covers/A.png]]\n'
        ),
        '2 Euro/Coins/b.md': coinNote({
          country: 'Malta',
          year: '2024',
          title: 'B',
          cover: '[[2 Euro/Covers/A.png]]',
        }),
        '2 Euro/Covers/A.png': new ArrayBuffer(4000),
      },
    });
    plugin.loadImageFromArrayBuffer = async () => ({ width: 1254, height: 1254 });
    plugin.resizeImageToCanvas = () => fakeCanvas();
    const result = await plugin.convertPngCoversToWebp();
    assert.equal(result.converted, 1);
    assert.deepEqual(vault.trashed, ['2 Euro/Covers/A.png']);
    for (const row of plugin.getRows()) assert.equal(row.cover, '[[2 Euro/Covers/A.webp]]');
    assert.match(vault.files.get('2 Euro/Coins/a.md'), /!\[\[2 Euro\/Covers\/A\.webp\]\]/);
  });
});
