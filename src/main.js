import { Plugin } from 'obsidian';

import { settingsMethods } from './plugin/settings.js';
import { i18nMethods } from './plugin/i18n.js';
import { vaultMethods } from './plugin/vault.js';
import { coinsMethods } from './plugin/coins.js';
import { maintenanceMethods } from './plugin/maintenance.js';
import { numistaMethods } from './plugin/numista.js';
import { syncMethods } from './plugin/sync.js';
import { pricesMethods } from './plugin/prices.js';
import { coversMethods } from './plugin/covers.js';
import { starterMethods } from './plugin/starter.js';
import { selectionMethods } from './plugin/selection.js';
import { imagesMethods } from './plugin/images.js';
import { dashboardMethods } from './plugin/dashboard.js';
import { historyMethods } from './plugin/history.js';
import { exportMethods } from './plugin/export.js';
import { operationsMethods } from './plugin/operations.js';
import { cacheMethods } from './plugin/cache.js';
import { diagnosticsMethods } from './plugin/diagnostics.js';
import { lifecycleMethods } from './plugin/lifecycle.js';

/**
 * The plugin class. Its behaviour lives in the method modules in src/plugin/,
 * mixed into the prototype below; see src/types.d.ts for the combined type.
 */
export default class TwoEuroCollectionPlugin extends Plugin {
  async onload() {
    await asPlugin(this).setup();
  }

  onunload() {
    asPlugin(this).teardown();
  }
}

/**
 * @param {TwoEuroCollectionPlugin} plugin
 * @returns {import('./types').TwoEuroPlugin}
 */
function asPlugin(plugin) {
  return /** @type {import('./types').TwoEuroPlugin} */ (/** @type {unknown} */ (plugin));
}

Object.assign(
  TwoEuroCollectionPlugin.prototype,
  lifecycleMethods,
  settingsMethods,
  i18nMethods,
  vaultMethods,
  coinsMethods,
  maintenanceMethods,
  numistaMethods,
  syncMethods,
  pricesMethods,
  coversMethods,
  starterMethods,
  selectionMethods,
  imagesMethods,
  dashboardMethods,
  historyMethods,
  exportMethods,
  operationsMethods,
  cacheMethods,
  diagnosticsMethods
);
