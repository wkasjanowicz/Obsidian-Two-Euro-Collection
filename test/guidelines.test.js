'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createPlugin } = require('./helpers/load-plugin');

test('Obsidian guidelines', async (t) => {
  await t.test('plain API key is moved to Obsidian secret storage', async () => {
    const { plugin, app } = await createPlugin({ settings: { numistaApiKey: 'KEY-1' } });
    const secrets = new Map();
    app.secretStorage = {
      setSecret: (id, value) => secrets.set(id, value),
      getSecret: (id) => secrets.get(id) ?? null,
    };
    assert.equal(await plugin.migrateApiKeyToSecretStorage(), true);
    assert.equal(plugin.settings.numistaApiKey, '');
    assert.equal(plugin.settings.numistaSecretId, 'numista-api-key');
    assert.equal(plugin.getNumistaApiKey(), 'KEY-1');
  });

  await t.test('without secret storage the key stays in settings', async () => {
    const { plugin } = await createPlugin({ settings: { numistaApiKey: 'KEY-2' } });
    assert.equal(await plugin.migrateApiKeyToSecretStorage(), false);
    assert.equal(plugin.getNumistaApiKey(), 'KEY-2');
  });

  await t.test('settings are described as searchable definitions', async () => {
    const { plugin } = await createPlugin({ settings: { additionalYears: ['2030'] } });
    await plugin.onload();
    const tab = plugin.settingTab;
    const groups = tab.getSettingDefinitions();
    const items = groups.flatMap((group) => group.items);
    assert.ok(items.length > 15);
    for (const item of items) {
      assert.equal(typeof item.name, 'string');
      assert.ok(item.name.length > 0);
      assert.equal(typeof item.render, 'function');
    }
    assert.ok(
      items.some((item) => item.name === '2030'),
      'additional year listed'
    );
  });

  await t.test('the last synchronization report is kept for the report window', async () => {
    const { plugin } = await createPlugin({ settings: { numistaApiKey: 'key' } });
    plugin.api = async (path) => {
      if (path.startsWith('/types?'))
        return path.includes('object_type=3') && path.includes('page=1')
          ? { types: [{ id: 5, title: 'Medal' }] }
          : { types: [] };
      return { id: 5, title: 'Medal', issuer: { name: 'Malta' }, value: { numeric_value: 2 } };
    };
    await plugin.syncNumista({ year: '2025' });
    assert.equal(plugin.lastSyncReport.items.length, 1);
    assert.match(plugin.lastSyncReport.items[0].reason, /not official/);
  });

  await t.test('no startup notice and no console.log in the sources', () => {
    const walk = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : entry.name.endsWith('.js') ? [full] : [];
      });
    for (const file of walk(path.join(__dirname, '..', 'src'))) {
      const code = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(code, /console\.(log|info|table)\(/, file);
      assert.doesNotMatch(code, /notice\.loaded/, file);
      assert.doesNotMatch(code, /window\.confirm\(/, file);
    }
  });
});
