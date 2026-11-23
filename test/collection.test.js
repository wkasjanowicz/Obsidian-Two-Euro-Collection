'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin, coinNote } = require('./helpers/load-plugin');

const rows = [
  {
    country: 'France',
    year: '2025',
    title: 'Louvre',
    owned: true,
    quantity: 3,
    numismatic_value_unc: 4,
    acquisition_price: 10,
    acquisition_currency: 'PLN',
  },
  {
    country: 'France',
    year: '2024',
    title: 'Olympics',
    owned: true,
    quantity: 1,
    numismatic_value_unc: '3,5',
    acquisition_currency: 'PLN',
  },
  { country: 'France', year: '2025', title: 'Notre Dame', owned: false },
  {
    country: 'Andorra',
    year: '2025',
    title: 'Vulture',
    owned: true,
    quantity: 1,
    acquisition_price: 5,
    acquisition_currency: 'EUR',
  },
];

test('collection helpers', async (t) => {
  const { sortRows, groupRows, computeStats, toCsv, formatMoney } =
    await import('../src/collection.js');

  await t.test('statistics: progress, value, spent, swap', () => {
    const stats = computeStats(rows);
    assert.equal(stats.owned, 3);
    assert.equal(stats.total, 4);
    assert.deepEqual(stats.byCountry, [
      { key: 'Andorra', owned: 1, total: 1 },
      { key: 'France', owned: 2, total: 3 },
    ]);
    assert.deepEqual(
      stats.byYear.map((item) => item.key),
      ['2024', '2025']
    );
    // 4 EUR x 3 pieces + 3.5 EUR; Andorra has no price
    assert.deepEqual(stats.value, [{ currency: 'EUR', amount: 15.5 }]);
    assert.equal(stats.valueMissing, 1);
    assert.deepEqual(stats.spent, [
      { currency: 'PLN', amount: 10 },
      { currency: 'EUR', amount: 5 },
    ]);
    assert.equal(stats.spentMissing, 1);
    assert.equal(stats.swapCoins, 1);
    assert.equal(stats.swapPieces, 2);
  });

  await t.test('grouping follows the sort direction', () => {
    const byYear = groupRows(sortRows(rows, 'yearDesc'), 'year', 'yearDesc');
    assert.deepEqual(
      byYear.map((g) => [g.label, g.owned, g.total]),
      [
        ['2025', 2, 3],
        ['2024', 1, 1],
      ]
    );
    const byCountry = groupRows(sortRows(rows, 'countryAsc'), 'country', 'countryAsc');
    assert.deepEqual(
      byCountry.map((g) => g.label),
      ['Andorra', 'France']
    );
    assert.equal(groupRows(rows, 'none').length, 1);
  });

  await t.test('CSV quotes values with separators and quotes', () => {
    const csv = toCsv(['a', 'b'], [['2 Euro (Louvre, Paris)', 'say "hi"']]);
    assert.equal(csv, 'a,b\r\n"2 Euro (Louvre, Paris)","say ""hi"""\r\n');
  });

  await t.test('money formatting handles unknown currencies', () => {
    assert.match(formatMoney(15.5, 'EUR', 'en'), /€15\.50/);
    assert.equal(formatMoney(3, 'zł', 'en'), '3.00 zł');
  });
});

test('collection features in the plugin', async (t) => {
  const files = {
    '2 Euro/Coins/France/a.md': coinNote({
      country: 'France',
      year: '2025',
      title: '2 Euro (Louvre Museum)',
      owned: true,
      quantity: 2,
    }),
    '2 Euro/Coins/France/b.md': coinNote({
      country: 'France',
      year: '2025',
      title: '2 Euro (Notre Dame de Paris)',
      numista_url: 'https://en.numista.com/1',
    }),
    '2 Euro/Coins/Malta/c.md': coinNote({
      country: 'Malta',
      year: '2024',
      title: '2 Euro (Temples)',
      coin_type: 'commemorative',
    }),
  };

  await t.test('"For swap" filter shows owned coins with 2+ pieces', async () => {
    const { plugin } = await createPlugin({ files });
    const titles = plugin.filterRowsByState(plugin.getRows(), { mode: 'swap' }).map((r) => r.title);
    assert.deepEqual(titles, ['2 Euro (Louvre Museum)']);
  });

  await t.test('export writes Markdown and CSV for the filtered missing coins', async () => {
    const { plugin, vault } = await createPlugin({ files, language: 'pl' });
    plugin.setDashboardState({ country: 'France', mode: 'owned' });
    const result = await plugin.exportMissingCoins();
    assert.equal(result.count, 1);
    const markdown = vault.files.get(result.markdownPath);
    assert.match(result.markdownPath, /^2 Euro\/Brakujące monety \d{4}-\d{2}-\d{2}\.md$/);
    assert.match(markdown, /## France \(1\)/);
    assert.match(
      markdown,
      /- \[ \] 2025 · 2 Euro \(Notre Dame de Paris\) · .* · \[Numista\]\(https:\/\/en\.numista\.com\/1\)/
    );
    assert.doesNotMatch(markdown, /Louvre|Temples/);
    const csv = vault.files.get(result.csvPath);
    assert.ok(csv.startsWith('﻿Kraj,Rok,Typ,Tytuł'));
    assert.match(csv, /France,2025,.*,2 Euro \(Notre Dame de Paris\)/);
  });
});
