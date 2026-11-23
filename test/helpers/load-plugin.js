'use strict';
/*
 * Loads the built main.js with the Obsidian API replaced by the in-memory mock.
 * Run `npm run build` first (npm test does it automatically).
 */
const Module = require('module');
const path = require('path');
const mock = require('./obsidian-mock');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'obsidian') return require.resolve('./obsidian-mock');
  return originalResolve.call(this, request, ...rest);
};

global.window = global.window || {
  setTimeout,
  clearTimeout,
  confirm: () => true,
  localStorage: { getItem: () => null },
  navigator: { language: 'en' },
};
global.document = global.document || {
  querySelector: () => null,
  querySelectorAll: () => [],
};

const built = require(path.join(__dirname, '..', '..', 'main.js'));
const PluginClass = built.default || built;

async function createPlugin({ files = {}, settings = {}, language = 'en' } = {}) {
  const app = mock.createApp(files);
  const plugin = new PluginClass(app, {
    id: 'two-euro-collection',
    version: 'test',
    dir: 'plugin',
  });
  plugin.__data = { language, ...settings };
  await plugin.loadSettings();
  await plugin.loadExternalLanguages();
  plugin.selectedCoinPaths = new Set();
  plugin.refreshDashboards = async () => {};
  plugin.refreshFilterViews = () => {};
  // Confirmation dialogs are answered with "yes" in tests.
  plugin.confirm = async () => true;
  return { plugin, app, vault: app.vault, notices: mock.notices };
}

/* Builds a coin note the way the plugin stores it. */
function coinNote(frontmatter, body = '') {
  const YAML = require('yaml');
  return `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n# ${frontmatter.title || ''}\n${body}`;
}

module.exports = { createPlugin, coinNote, mock };
