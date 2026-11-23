'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const { createPlugin, coinNote } = require('./helpers/load-plugin');

const frontmatter = (content) => YAML.parse(content.match(/^---\n([\s\S]*?)\n---/)[1]);

test('coin notes', async (t) => {
  await t.test('getRows reads only the coins folder', async () => {
    const { plugin } = await createPlugin({
      files: {
        '2 Euro/Coins/Andorra/2025 - A.md': coinNote({
          country: 'Andorra',
          year: '2025',
          title: 'A',
        }),
        '2 Euro/Coins/B.md': coinNote({ country: 'Malta', year: '2024', title: 'B' }),
        '2 Euro/Coins/Andorra/image.png': 'binary',
        'Daily/2025-01-01.md': coinNote({ country: 'Spain', year: '2020', title: 'Not a coin' }),
      },
    });
    const paths = plugin
      .getRows()
      .map((row) => row.file.path)
      .sort();
    assert.deepEqual(paths, ['2 Euro/Coins/Andorra/2025 - A.md', '2 Euro/Coins/B.md']);
  });

  await t.test('a new coin without price does not store acquisition_price: 0', async () => {
    const { plugin, vault } = await createPlugin();
    const file = await plugin.upsert(
      { country: 'Germany', year: '2024', title: '2 Euros Test', acquisition_price: '' },
      null
    );
    const fm = frontmatter(vault.files.get(file.path));
    assert.equal(file.path, '2 Euro/Coins/Germany/2024 - 2 Euro Test.md');
    assert.equal(fm.title, '2 Euro Test');
    assert.ok(!('acquisition_price' in fm));
  });

  await t.test('editing keeps the note body and custom frontmatter', async () => {
    const path = '2 Euro/Coins/Germany/2024 - T.md';
    const { plugin, vault } = await createPlugin({
      files: {
        [path]: `---\ncountry: Germany\nyear: "2024"\ntitle: T\ntags:\n  - mine\n---\n\n# T\n\nMy notes about this coin.\n`,
      },
    });
    const row = plugin.getRows()[0];
    await plugin.upsert({ ...row, owned: true, cover_path: '2 Euro/Covers/a.webp' }, row.file);
    let content = vault.files.get(path);
    assert.deepEqual(frontmatter(content).tags, ['mine']);
    assert.equal(frontmatter(content).owned, true);
    assert.match(content, /My notes about this coin\./);
    assert.match(content, /!\[\[2 Euro\/Covers\/a\.webp\]\]/);

    const updated = plugin.getRows()[0];
    await plugin.upsert({ ...updated, cover_path: '2 Euro/Covers/b.webp' }, updated.file);
    content = vault.files.get(path);
    assert.match(content, /!\[\[2 Euro\/Covers\/b\.webp\]\]/);
    assert.doesNotMatch(content, /a\.webp\]\]/);
  });

  await t.test('manual edit renames the note to match country, year and title', async () => {
    const { plugin, vault } = await createPlugin({
      files: {
        '2 Euro/Coins/Germany/2024 - T.md': coinNote({
          country: 'Germany',
          year: '2024',
          title: 'T',
        }),
      },
    });
    const row = plugin.getRows()[0];
    await plugin.upsert({ ...row, country: 'France', title: 'New title' }, row.file, {
      rename: true,
    });
    assert.ok(vault.files.has('2 Euro/Coins/France/2024 - New title.md'));
    assert.match(vault.files.get('2 Euro/Coins/France/2024 - New title.md'), /# New title/);
  });

  await t.test('dashboard filter uses country, year, type and search', async () => {
    const { plugin } = await createPlugin({
      files: {
        '2 Euro/Coins/a.md': coinNote({
          country: 'France',
          year: '2025',
          title: 'Louvre',
          coin_type: 'commemorative',
        }),
        '2 Euro/Coins/b.md': coinNote({
          country: 'France',
          year: '2025',
          title: '2nd type',
          coin_type: 'national',
          owned: true,
        }),
        '2 Euro/Coins/c.md': coinNote({
          country: 'Malta',
          year: '2025',
          title: 'X',
          coin_type: 'commemorative',
        }),
      },
    });
    const titles = (state) =>
      plugin
        .filterRowsByState(plugin.getRows(), state)
        .map((row) => row.title)
        .sort();
    assert.deepEqual(titles({ country: 'France', mode: 'all' }), ['2nd type', 'Louvre']);
    assert.deepEqual(titles({ mode: 'owned' }), ['2nd type']);
    assert.deepEqual(titles({ mode: 'commemorative', searchText: 'louv' }), ['Louvre']);
  });
});
