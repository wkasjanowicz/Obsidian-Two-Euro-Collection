'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const { createPlugin, coinNote } = require('./helpers/load-plugin');

const twoEuro = (id, title, issuer, year) => ({
  id,
  title,
  issuer: { name: issuer },
  min_year: year,
  max_year: year,
});

/* Fake Numista search: object_type -> results; optionally rejects the year filter. */
function fakeSearch(plugin, { listing = {}, rejectYear = false }) {
  const calls = [];
  plugin.api = async (path) => {
    calls.push(path);
    const params = new URLSearchParams(path.split('?')[1]);
    if (rejectYear && params.has('year')) throw new Error('Request failed, status 400');
    if (params.get('page') !== '1') return { types: [] };
    return { types: listing[params.get('object_type')] || [] };
  };
  return calls;
}

test('new coins check', async (t) => {
  await t.test('checks the current year, and the next one from October', async () => {
    const { plugin } = await createPlugin();
    assert.deepEqual(plugin.newIssueYears(new Date(2026, 2, 1)), [2026]);
    assert.deepEqual(plugin.newIssueYears(new Date(2026, 9, 1)), [2026, 2027]);
  });

  await t.test('runs only when due and enabled', async () => {
    const { plugin } = await createPlugin({ settings: { numistaApiKey: 'key' } });
    const now = Date.parse('2026-11-20T12:00:00Z');
    plugin.settings.newIssuesCheckDays = 0;
    assert.equal(plugin.isNewIssuesCheckDue(now), false);
    plugin.settings.newIssuesCheckDays = 7;
    plugin.settings.newIssuesLastCheck = '';
    assert.equal(plugin.isNewIssuesCheckDue(now), true);
    plugin.settings.newIssuesLastCheck = '2026-11-18T12:00:00Z';
    assert.equal(plugin.isNewIssuesCheckDue(now), false);
    plugin.settings.newIssuesLastCheck = '2026-11-10T12:00:00Z';
    assert.equal(plugin.isNewIssuesCheckDue(now), true);
  });

  await t.test('reports euro coins missing from the collection and offers a sync', async () => {
    const { plugin, notices } = await createPlugin({
      settings: { numistaApiKey: 'key' },
      files: {
        '2 Euro/Coins/Andorra/2026 - Known.md': coinNote({
          country: 'Andorra',
          year: '2026',
          title: 'Known',
          numista_id: '11',
        }),
      },
    });
    plugin.newIssueYears = () => [2026];
    const calls = fakeSearch(plugin, {
      listing: {
        3: [
          twoEuro(10, '2 Euros (New design)', 'Andorra', 2026),
          twoEuro(11, '2 Euros (Known)', 'Andorra', 2026),
          twoEuro(12, '2 Euros (Not euro)', 'Poland', 2026),
        ],
      },
    });
    notices.length = 0;
    const result = await plugin.checkNewIssues({ quiet: true });
    assert.equal(result.total, 1);
    assert.deepEqual(result.byYear, [{ year: '2026', count: 1, titles: ['2 Euros (New design)'] }]);
    assert.equal(calls.length, 3, 'one search per coin category');
    assert.ok(calls.every((path) => path.includes('year=2026')));
    assert.ok(plugin.settings.newIssuesLastCheck);
    const notice = notices.find((text) => text.includes('Synchronize 2026'));
    assert.ok(notice, 'notice with a sync button');
  });

  await t.test('filters the year locally when Numista rejects the year filter', async () => {
    const { plugin } = await createPlugin({ settings: { numistaApiKey: 'key' } });
    plugin.newIssueYears = () => [2026];
    fakeSearch(plugin, {
      rejectYear: true,
      listing: {
        2: [twoEuro(20, 'Old', 'France', 2024), twoEuro(21, 'This year', 'France', 2026)],
      },
    });
    const result = await plugin.checkNewIssues({ quiet: true });
    assert.equal(result.total, 1);
    assert.deepEqual(result.byYear[0].titles, ['This year']);
  });

  await t.test('a quiet check without findings shows nothing; a manual one says so', async () => {
    const { plugin, notices } = await createPlugin({ settings: { numistaApiKey: 'key' } });
    plugin.newIssueYears = () => [2026];
    fakeSearch(plugin, {});
    notices.length = 0;
    await plugin.checkNewIssues({ quiet: true });
    assert.equal(notices.length, 0);
    await plugin.checkNewIssues({ quiet: false });
    assert.ok(notices.some((text) => text.includes('No new 2 euro coins')));
  });

  await t.test('the background check needs an API key', async () => {
    const { plugin } = await createPlugin();
    plugin.api = async () => {
      throw new Error('must not be called');
    };
    assert.equal(await plugin.checkNewIssuesIfDue(), null);
  });
});

test('Bases view', async (t) => {
  await t.test('creates a .base file for the coin folder and opens it', async () => {
    const { plugin, app, vault } = await createPlugin();
    const file = await plugin.openBasesView();
    assert.equal(file.path, '2 Euro/2 Euro collection.base');
    const config = YAML.parse(vault.files.get(file.path));
    assert.deepEqual(config.filters.and, ['file.inFolder("2 Euro/Coins")', 'file.ext == "md"']);
    assert.deepEqual(
      config.views.map((view) => view.type),
      ['cards', 'table', 'table', 'table', 'table']
    );
    assert.equal(config.views[0].image, 'note.cover');
    assert.deepEqual(config.views[2].filters.and, ['owned != true']);
    assert.deepEqual(config.views[4].filters.and, ['owned == true', 'quantity > 1']);
    assert.equal(config.properties.country.displayName, 'Country');
    assert.deepEqual(app.workspace.opened, ['2 Euro/2 Euro collection.base']);
  });

  await t.test('keeps an existing file unless recreated', async () => {
    const { plugin, vault } = await createPlugin({
      files: { '2 Euro/2 Euro collection.base': 'views: []\n' },
    });
    await plugin.openBasesView();
    assert.equal(vault.files.get('2 Euro/2 Euro collection.base'), 'views: []\n');
    await plugin.openBasesView({ recreate: true });
    assert.match(vault.files.get('2 Euro/2 Euro collection.base'), /file\.inFolder/);
  });

  await t.test('uses translated names', async () => {
    const { plugin } = await createPlugin({ language: 'pl' });
    assert.equal(plugin.basesPath(), '2 Euro/Kolekcja 2 Euro.base');
    assert.equal(plugin.buildBasesConfig().views[2].name, 'Brakujące');
  });
});
