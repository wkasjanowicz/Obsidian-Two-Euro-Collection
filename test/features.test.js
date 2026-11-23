'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin, coinNote } = require('./helpers/load-plugin');
const { FakeElement } = require('./helpers/fake-dom');

const coins = {
  '2 Euro/Coins/France/a.md': coinNote({
    country: 'France',
    year: '2025',
    title: 'Louvre',
    owned: true,
    quantity: 3,
    numismatic_value_unc: 4,
    numismatic_value_currency: 'EUR',
    acquisition_price: 12,
    acquisition_currency: 'PLN',
    cover: '[[2 Euro/Covers/a.webp]]',
  }),
  '2 Euro/Coins/Malta/b.md': coinNote({ country: 'Malta', year: '2024', title: 'Temples' }),
  '2 Euro/Covers/a.webp': new ArrayBuffer(10),
};

test('dashboard rendering', async (t) => {
  await t.test('renders statistics, group headers and lazy covers', async () => {
    const { plugin } = await createPlugin({ files: coins, language: 'pl' });
    plugin.setDashboardState({ groupBy: 'country', statsOpen: true });
    const el = new FakeElement('div');
    await plugin.renderDashboard(el);
    const texts = el.findAll((e) => e.text).map((e) => e.text);
    assert.ok(texts.includes('Statystyki'));
    assert.ok(texts.includes('1 / 2 (50%)'));
    assert.ok(
      texts.some((x) => /12,00\s€/.test(x)),
      'value 4 EUR x 3'
    );
    assert.ok(
      texts.some((x) => /36,00\szł/.test(x)),
      'spent 12 PLN x 3'
    );
    assert.deepEqual(
      el.byClass('twoeuro-group-title').map((e) => e.text),
      ['France', 'Malta']
    );
    const img = el.findAll((e) => e.tag === 'img')[0];
    assert.equal(img.attr.loading, 'lazy');
    assert.ok(texts.includes('✓ Posiadana ×3'));
    assert.equal(el.byClass('twoeuro-card')[0].attr.tabindex, '0');
  });

  await t.test('dashboard state is remembered in settings', async () => {
    const { plugin } = await createPlugin({ files: coins });
    plugin.setDashboardState({ country: 'Malta', groupBy: 'year' });
    assert.equal(plugin.settings.dashboardState.country, 'Malta');
    assert.equal(plugin.settings.dashboardState.groupBy, 'year');
  });
});

test('collection data', async (t) => {
  await t.test('getRows reads the folder once per task', async () => {
    const { plugin, app } = await createPlugin({ files: coins });
    let reads = 0;
    const original = app.metadataCache.getFileCache;
    app.metadataCache.getFileCache = (file) => (reads++, original(file));
    plugin.getRows();
    plugin.getRows();
    plugin.getRows();
    assert.equal(reads, 2, 'two coin notes read once');
    await Promise.resolve();
    plugin.getRows();
    assert.equal(reads, 4, 'cache cleared after the task');
  });

  await t.test('changing folders moves the collection and fixes cover links', async () => {
    const { plugin, vault } = await createPlugin({ files: coins });
    const ok = await plugin.changeFolders({
      collectionFolder: 'Kolekcje/Euro',
      coversFolder: 'Okladki',
    });
    assert.equal(ok, true);
    assert.ok(vault.files.has('Kolekcje/Euro/Coins/France/a.md'));
    assert.ok(vault.files.has('Kolekcje/Euro/Okladki/a.webp'));
    assert.match(
      vault.files.get('Kolekcje/Euro/Coins/France/a.md'),
      /\[\[Kolekcje\/Euro\/Okladki\/a\.webp\]\]/
    );
    assert.equal(plugin.getRows().length, 2);
  });

  await t.test('export of coins for swap lists spare pieces', async () => {
    const { plugin, vault } = await createPlugin({ files: coins });
    const result = await plugin.exportCoinList('swap');
    assert.equal(result.count, 1);
    assert.match(vault.files.get(result.markdownPath), /Louvre · .* · ×2/);
    assert.match(vault.files.get(result.csvPath), /Spare pieces/);
  });

  await t.test('value snapshot is stored once per day', async () => {
    const { plugin } = await createPlugin({ files: coins });
    await plugin.recordValueSnapshot();
    await plugin.recordValueSnapshot();
    assert.equal(plugin.settings.valueHistory.length, 1);
    assert.deepEqual(plugin.settings.valueHistory[0].value, [{ currency: 'EUR', amount: 12 }]);
  });

  await t.test('diagnostics never contain the API key', async () => {
    const { plugin } = await createPlugin({
      files: coins,
      settings: { numistaApiKey: 'SECRET-123' },
    });
    const report = plugin.diagnosticsReport();
    assert.doesNotMatch(report, /SECRET-123/);
    assert.match(report, /API key set: yes/);
    assert.match(report, /Coins: 2 \(owned 1/);
  });
});

test('Numista requests', async (t) => {
  await t.test('type details are cached between synchronizations', async () => {
    const { plugin } = await createPlugin({ settings: { numistaApiKey: 'key' } });
    let calls = 0;
    plugin.api = async () => (calls++, { id: 7, title: 'X', issuer: { name: 'Malta' } });
    await plugin.getTypeDetails(7);
    await plugin.getTypeDetails(7);
    assert.equal(calls, 1);
    await plugin.getTypeDetails(7, { fresh: true });
    assert.equal(calls, 2);
    plugin.settings.numistaCacheDays = 0;
    await plugin.getTypeDetails(7);
    assert.equal(calls, 3, 'cache disabled');
  });

  await t.test('requests are counted per month', async () => {
    const { plugin } = await createPlugin();
    plugin.waitForRequestSlot = async () => {};
    await plugin.runOperation(async () => {
      plugin.countNumistaRequest();
      plugin.countNumistaRequest();
    });
    assert.equal(plugin.settings.numistaRequestCount, 2);
    assert.equal(plugin.settings.numistaRequestMonth, new Date().toISOString().slice(0, 7));
  });

  await t.test('a running synchronization can be stopped', async () => {
    const { plugin } = await createPlugin({ settings: { numistaApiKey: 'key' } });
    plugin.waitForRequestSlot = async () => {};
    let requests = 0;
    plugin.api = async (path) => {
      requests++;
      if (requests === 2) plugin.abortOperation();
      plugin.throwIfAborted();
      if (path.startsWith('/types?')) return { types: [{ id: requests, title: 'X' }] };
      return { id: 1 };
    };
    await plugin.syncNumista({ year: '2025' });
    assert.ok(requests <= 3, `stopped early (${requests} requests)`);
    assert.equal(plugin.isOperationRunning(), false);
  });
});
