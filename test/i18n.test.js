'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sourceFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });

test('translations', async (t) => {
  const { BASE_LANGUAGE } = await import('../src/i18n/en.js');
  const pl = JSON.parse(fs.readFileSync(path.join(root, 'Languages', 'pl.json'), 'utf8'));

  await t.test('every key used in the code exists in English', () => {
    const used = new Set();
    for (const file of sourceFiles(path.join(root, 'src'))) {
      const code = fs.readFileSync(file, 'utf8');
      for (const match of code.matchAll(/\bt\(\s*'([a-zA-Z]+\.[a-zA-Z.]+)'/g)) used.add(match[1]);
    }
    const missing = [...used].filter((key) => !(key in BASE_LANGUAGE));
    assert.deepEqual(missing, []);
  });

  await t.test('Polish has every English key', () => {
    const missing = Object.keys(BASE_LANGUAGE).filter((key) => !(key in pl.strings));
    assert.deepEqual(missing, []);
  });

  await t.test('placeholders match between languages', () => {
    const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const mismatched = Object.keys(BASE_LANGUAGE).filter(
      (key) =>
        key in pl.strings &&
        placeholders(BASE_LANGUAGE[key]).join() !== placeholders(pl.strings[key]).join()
    );
    assert.deepEqual(mismatched, []);
  });
});
