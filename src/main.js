import { Plugin, Notice } from 'obsidian';
import { VIEW_TYPE_FILTERS } from './constants.js';
import { CoinModal } from './ui/CoinModal.js';
import { EuroSettings } from './ui/EuroSettings.js';
import { EuroFiltersView } from './ui/EuroFiltersView.js';

import { settingsMethods } from './plugin/settings.js';
import { i18nMethods } from './plugin/i18n.js';
import { vaultMethods } from './plugin/vault.js';
import { coinsMethods } from './plugin/coins.js';
import { maintenanceMethods } from './plugin/maintenance.js';
import { numistaMethods } from './plugin/numista.js';
import { starterMethods } from './plugin/starter.js';
import { selectionMethods } from './plugin/selection.js';
import { imagesMethods } from './plugin/images.js';
import { dashboardMethods } from './plugin/dashboard.js';
import { historyMethods } from './plugin/history.js';

export default class TwoEuroCollectionPlugin extends Plugin {
  onunload() {
    if (this._refreshTimer) window.clearTimeout(this._refreshTimer);
  }

  async onload() {
    console.log(`2 Euro Collection ${this.manifest.version} starting`);
    await this.loadSettings();
    await this.loadExternalLanguages();
    this.dashboardState = {
      mode: 'all',
      country: '',
      year: '',
      searchText: '',
      sortMode: 'yearAsc',
    };
    this.selectedCoinPaths = new Set();
    this.registerView(VIEW_TYPE_FILTERS, (leaf) => new EuroFiltersView(leaf, this));
    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.closeFiltersViewIfDashboardClosed())
    );
    /*
     * Refresh the dashboard whenever coin notes or covers change, including
     * notes created during synchronization. 'changed' fires only after
     * Obsidian has indexed the frontmatter, so new coins are visible at once.
     */
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        if (this.isCollectionPath(file?.path)) this.scheduleDashboardRefresh();
      })
    );
    for (const eventName of ['create', 'delete']) {
      this.registerEvent(
        this.app.vault.on(eventName, (file) => {
          if (this.isCollectionPath(file?.path)) this.scheduleDashboardRefresh();
        })
      );
    }
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (this.isCollectionPath(file?.path) || this.isCollectionPath(oldPath))
          this.scheduleDashboardRefresh();
      })
    );
    this.addCommand({
      id: 'two-euro-open-filters',
      name: this.t('sidebar.open'),
      callback: () => this.activateFiltersView(),
    });
    this.addRibbonIcon('circle-dollar-sign', '2 Euro Collection', () => this.openDashboard());
    this.addCommand({
      id: 'two-euro-open',
      name: this.t('command.open'),
      callback: () => this.openDashboard(),
    });
    this.addCommand({
      id: 'two-euro-add',
      name: this.t('command.add'),
      callback: () => new CoinModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'two-euro-install-starter',
      name: this.t('command.installStarter'),
      callback: async () => {
        const confirmed = window.confirm(this.t('confirm.installStarter'));

        if (!confirmed) {
          return;
        }

        try {
          await this.installStarterCollection();
        } catch (error) {
          console.error('Starter collection installation', error);

          new Notice(error?.message || String(error));
        }
      },
    });

    this.addCommand({
      id: 'two-euro-sync',
      name: this.t('command.sync'),
      callback: () => this.syncNumista(),
    });
    this.addCommand({
      id: 'two-euro-convert-covers-webp',
      name: this.t('command.convertCoversWebp'),
      callback: () => this.convertPngCoversToWebp(),
    });
    this.addCommand({
      id: 'two-euro-update-prices',
      name: this.t('command.updatePrices'),
      callback: () => this.updateNumistaPrices(),
    });
    this.addCommand({
      id: 'two-euro-covers',
      name: this.t('command.covers'),
      callback: () => this.backfillCovers(),
    });
    this.addCommand({
      id: 'two-euro-remove-current-background',
      name: this.t('command.removeCurrentBackground'),
      callback: () => this.removeBackgroundFromCurrentCoin(),
    });
    this.addCommand({
      id: 'two-euro-catalog-preset-current',
      name: this.t('command.catalogPresetCurrent'),
      callback: () => this.applyCatalogPresetToCurrentCoin(),
    });
    this.addCommand({
      id: 'two-euro-dedupe',
      name: this.t('command.dedupe'),
      callback: async () => new Notice(this.t('notice.dedupe', { count: await this.dedupe() })),
    });
    this.addCommand({
      id: 'two-euro-init-reference-fields',
      name: this.t('command.initFields'),
      callback: async () => {
        const result = await this.initializeReferenceFields();
        new Notice(this.t('notice.initFields', result));
      },
    });
    this.addCommand({
      id: 'two-euro-migrate-covers',
      name: this.t('command.migrateCovers'),
      callback: async () => {
        const fixed = await this.migrateCoverLinks();
        new Notice(this.t('notice.coversMigrated', { count: fixed }));
      },
    });
    this.addCommand({
      id: 'two-euro-normalize-folders',
      name: this.t('command.normalizeFolders'),
      callback: async () =>
        new Notice(
          this.t('notice.foldersNormalized', { count: await this.normalizeCountryFolders() })
        ),
    });
    this.addCommand({
      id: 'two-euro-normalize-protected-covers',
      name: this.t('command.normalizeProtectedCovers'),
      callback: () => this.normalizeProtectedCoverNames(),
    });
    this.addCommand({
      id: 'two-euro-normalize-titles',
      name: this.t('command.normalizeTitles'),
      callback: () => this.normalizeExistingTitles(),
    });
    this.addCommand({
      id: 'two-euro-remove-unofficial',
      name: this.t('command.removeUnofficial'),
      callback: () => this.removeUnofficialImports(),
    });
    this.registerMarkdownCodeBlockProcessor('two-euro-collection', async (_src, el) => {
      try {
        await this.renderDashboard(el);
      } catch (e) {
        console.error('2 Euro dashboard', e);
        el.empty();
        el.createEl('pre', { text: `2 Euro Collection: ${e.message || e}` });
      }
    });
    this.addSettingTab(new EuroSettings(this.app, this));
    console.log(`2 Euro Collection ${this.manifest.version} loaded`);
    new Notice(this.t('notice.loaded', { version: this.manifest.version }));
  }
}

Object.assign(
  TwoEuroCollectionPlugin.prototype,
  settingsMethods,
  i18nMethods,
  vaultMethods,
  coinsMethods,
  maintenanceMethods,
  numistaMethods,
  starterMethods,
  selectionMethods,
  imagesMethods,
  dashboardMethods,
  historyMethods
);
