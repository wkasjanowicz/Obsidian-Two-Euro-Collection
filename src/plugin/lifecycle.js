import { Notice } from 'obsidian';
import { VIEW_TYPE_FILTERS } from '../constants.js';
import { errorText } from '../utils.js';
import { CoinModal } from '../ui/CoinModal.js';
import { EuroSettings } from '../ui/EuroSettings.js';
import { EuroFiltersView } from '../ui/EuroFiltersView.js';
import { SyncReportModal } from '../ui/SyncReportModal.js';

/* Plugin start-up and shutdown: views, events, commands and settings tab. */
/** @satisfies {ThisType<import('../types').TwoEuroPlugin>} */
export const lifecycleMethods = {
  teardown() {
    if (this._refreshTimer) window.clearTimeout(this._refreshTimer);
    if (this._cacheSaveTimer) void this.saveNumistaCache();
    if (this._settingsSaveTimer) {
      window.clearTimeout(this._settingsSaveTimer);
      void this.saveSettings();
    }
  },

  async setup() {
    await this.loadSettings();
    await this.loadExternalLanguages();
    await this.migrateApiKeyToSecretStorage();
    this.dashboardState = {
      mode: 'all',
      country: '',
      year: '',
      searchText: '',
      sortMode: 'yearAsc',
      groupBy: 'none',
      statsOpen: false,
      ...(this.settings.dashboardState && typeof this.settings.dashboardState === 'object'
        ? this.settings.dashboardState
        : {}),
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
    /** @param {import('obsidian').TAbstractFile} file */
    const onFileChange = (file) => {
      if (this.isCollectionPath(file?.path)) this.scheduleDashboardRefresh();
    };
    this.registerEvent(this.app.vault.on('create', onFileChange));
    this.registerEvent(this.app.vault.on('delete', onFileChange));
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
        const confirmed = await this.confirm(this.t('confirm.installStarter'));

        if (!confirmed) {
          return;
        }

        try {
          await this.installStarterCollection();
        } catch (error) {
          console.error('Starter collection installation', error);

          new Notice(errorText(error));
        }
      },
    });

    this.addCommand({
      id: 'two-euro-check-new-issues',
      name: this.t('command.checkNewIssues'),
      callback: () => this.checkNewIssuesNow(),
    });
    this.addCommand({
      id: 'two-euro-open-bases',
      name: this.t('command.openBases'),
      callback: () => this.openBasesView(),
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
      id: 'two-euro-abort',
      name: this.t('command.abort'),
      checkCallback: (checking) => {
        if (!this.isOperationRunning()) return false;
        if (!checking) this.abortOperation();
        return true;
      },
    });
    this.addCommand({
      id: 'two-euro-export-missing',
      name: this.t('command.exportMissing'),
      callback: () => this.exportCoinList('missing'),
    });
    this.addCommand({
      id: 'two-euro-export-owned',
      name: this.t('command.exportOwned'),
      callback: () => this.exportCoinList('owned'),
    });
    this.addCommand({
      id: 'two-euro-export-swap',
      name: this.t('command.exportSwap'),
      callback: () => this.exportCoinList('swap'),
    });
    this.addCommand({
      id: 'two-euro-value-snapshot',
      name: this.t('command.valueSnapshot'),
      callback: async () => {
        await this.recordValueSnapshot();
        new Notice(this.t('notice.valueSnapshot'));
        await this.refreshDashboards();
      },
    });
    this.addCommand({
      id: 'two-euro-sync-report',
      name: this.t('command.syncReport'),
      callback: () => new SyncReportModal(this.app, this).open(),
    });
    this.addCommand({
      id: 'two-euro-diagnostics',
      name: this.t('command.diagnostics'),
      callback: () => this.copyDiagnostics(),
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
    this.registerMarkdownCodeBlockProcessor('two-euro-collection', (_src, el, ctx) => {
      try {
        this.registerDashboard(el, ctx);
        this.renderDashboard(el);
      } catch (e) {
        console.error('2 Euro dashboard', e);
        el.empty();
        el.createEl('pre', { text: `2 Euro Collection: ${errorText(e)}` });
      }
    });
    this.scheduleNewIssuesCheck();
    this.settingTab = new EuroSettings(this.app, this);
    this.addSettingTab(this.settingTab);
  },
};
