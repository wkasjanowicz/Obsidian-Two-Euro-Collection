'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin, coinNote } = require('./helpers/load-plugin');

const euroType = (
  id,
  title,
  objectType = { id: 3, name: 'Non-circulating coins' },
  issuer = 'Andorra'
) => ({
  id,
  title,
  url: `https://en.numista.com/${id}`,
  issuer: { name: issuer },
  object_type: objectType,
  value: { numeric_value: 2, currency: { name: 'Euro', full_name: 'Euro (2014-date)' } },
});

/* Fake Numista API. listing: object_type -> basic types on page 1. */
function fakeApi(plugin, { listing = {}, details = {}, issues = {}, issuers = [] }) {
  const calls = [];
  plugin.api = async (path) => {
    calls.push(path);
    if (path.startsWith('/issuers')) return { issuers };
    if (path.startsWith('/types?')) {
      const params = new URLSearchParams(path.split('?')[1]);
      if (params.get('page') !== '1') return { types: [] };
      return { types: listing[params.get('object_type')] || [] };
    }
    const issuesMatch = path.match(/^\/types\/(\d+)\/issues\?/);
    if (issuesMatch) return issues[issuesMatch[1]] || [];
    const typeMatch = path.match(/^\/types\/(\d+)\?/);
    if (typeMatch) return details[typeMatch[1]];
    if (path.includes('/prices'))
      return { currency: 'EUR', prices: [{ grade: 'unc', price: 3.5 }] };
    throw new Error(`Unexpected request ${path}`);
  };
  return calls;
}

const andorra = (extra = {}) => ({
  country: 'Andorra',
  year: '2025',
  coin_type: 'commemorative',
  ...extra,
});

test('Numista synchronization', async (t) => {
  await t.test(
    'creates missing coins, passes issuer, year and q, downloads no prices',
    async () => {
      const { plugin } = await createPlugin({ settings: { numistaApiKey: 'key' } });
      const calls = fakeApi(plugin, {
        issuers: [{ code: 'andorre', name: 'Andorra' }],
        listing: { 3: [{ id: 10, title: 'Vulture', min_year: 2025, max_year: 2025 }] },
        details: { 10: euroType(10, '2 Euros (Bearded vulture)') },
        issues: { 10: [{ id: 100, gregorian_year: 2025 }] },
      });
      const result = await plugin.syncNumista({ country: 'Andorra', year: '2025' });
      assert.equal(result.created, 1);
      assert.equal(plugin.getRows()[0].title, '2 Euro (Bearded vulture)');
      const listingCall = calls.find((c) => c.includes('object_type=3'));
      assert.match(listingCall, /q=2\+Euros/);
      assert.match(listingCall, /issuer=andorre/);
      assert.match(listingCall, /year=2025/);
      assert.ok(!calls.some((c) => c.includes('/prices')));
    }
  );

  await t.test('skips coins already in the collection without extra requests', async () => {
    const { plugin } = await createPlugin({
      settings: { numistaApiKey: 'key' },
      files: {
        '2 Euro/Coins/Andorra/v.md': coinNote(
          andorra({ title: 'V', numista_id: '10', numista_issue_id: '100' })
        ),
      },
    });
    const calls = fakeApi(plugin, {
      listing: { 3: [{ id: 10, title: 'Vulture', min_year: 2025, max_year: 2025 }] },
    });
    const result = await plugin.syncNumista({ country: 'Andorra', year: '2025' });
    assert.equal(result.existing, 1);
    assert.equal(result.created, 0);
    assert.ok(!calls.some((c) => /^\/types\/\d+/.test(c)), 'no details/issues requests');
  });

  await t.test('national types: only missing years are added', async () => {
    const { plugin } = await createPlugin({
      settings: { numistaApiKey: 'key' },
      files: {
        '2 Euro/Coins/Andorra/n.md': coinNote(
          andorra({
            title: '2 Euro',
            coin_type: 'national',
            numista_id: '1',
            numista_issue_id: '1-2025',
          })
        ),
      },
    });
    fakeApi(plugin, {
      listing: { 1: [{ id: 1, title: '2 Euros', min_year: 2023, max_year: 2025 }] },
      details: { 1: euroType(1, '2 Euros', { id: 1, name: 'Standard circulation coins' }) },
      issues: { 1: [2023, 2024, 2025].map((year) => ({ id: `1-${year}`, gregorian_year: year })) },
    });
    const result = await plugin.syncNumista({ country: 'Andorra' });
    assert.equal(result.created, 2);
    assert.equal(result.existing, 1);
  });

  await t.test('links a manually added coin instead of duplicating it', async () => {
    const path = '2 Euro/Coins/France/2025 - Notre-Dame.md';
    const { plugin } = await createPlugin({
      settings: { numistaApiKey: 'key' },
      files: {
        [path]: coinNote({
          country: 'France',
          year: '2025',
          title: '2 Euro (Notre-Dame de Paris)',
          owned: true,
        }),
      },
    });
    fakeApi(plugin, {
      listing: { 3: [{ id: 999, title: '2 Euros (Notre Dame de Paris)' }] },
      details: { 999: euroType(999, '2 Euros (Notre Dame de Paris)', undefined, 'France') },
      issues: { 999: [{ id: 5, gregorian_year: 2025 }] },
    });
    const result = await plugin.syncNumista({ country: 'France', year: '2025' });
    assert.equal(result.created, 0);
    assert.equal(plugin.getRows().length, 1);
    assert.equal(plugin.getRows()[0].numista_id, '999');
  });

  await t.test('stops at once on an invalid API key (HTTP 401)', async () => {
    const { plugin, notices } = await createPlugin({ settings: { numistaApiKey: 'bad' } });
    let requests = 0;
    plugin.requestWithRetry = async () => {
      requests++;
      throw new Error('Request failed, status 401');
    };
    await plugin.syncNumista({ country: 'Andorra', year: '2025' });
    assert.equal(requests, 1);
    assert.match(notices.at(-1), /API key/);
  });

  await t.test('retries without server-side filters when Numista rejects them', async () => {
    const { plugin } = await createPlugin({ settings: { numistaApiKey: 'key' } });
    const calls = [];
    plugin.api = async (path) => {
      calls.push(path);
      if (path.startsWith('/types?') && path.includes('year=')) throw new Error('Numista HTTP 400');
      return { types: [] };
    };
    const result = await plugin.syncNumista({ year: '2025', coinType: 'national' });
    assert.equal(result.errors, 0);
    assert.ok(calls.length === 2 && !calls[1].includes('year='));
  });

  await t.test('"Update prices" updates the filtered coins only', async () => {
    const { plugin } = await createPlugin({
      settings: { numistaApiKey: 'key' },
      files: {
        '2 Euro/Coins/a.md': coinNote(
          andorra({ title: 'A', numista_id: '1', numista_issue_id: '11' })
        ),
        '2 Euro/Coins/b.md': coinNote({
          country: 'Malta',
          year: '2025',
          title: 'B',
          numista_id: '2',
          numista_issue_id: '22',
        }),
      },
    });
    const calls = fakeApi(plugin, {});
    plugin.setDashboardState({ country: 'Andorra', mode: 'all' });
    const result = await plugin.updateNumistaPrices();
    assert.equal(result.updated, 1);
    assert.equal(calls.length, 1);
    const row = plugin.getRows().find((r) => r.title === 'A');
    assert.equal(row.numismatic_value_unc, 3.5);
  });
});
