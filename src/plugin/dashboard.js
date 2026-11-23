import { VIEW_TYPE_FILTERS } from '../constants.js';
import { tx, countryName } from '../utils.js';
import { CoinModal } from '../ui/CoinModal.js';
import { CoinCoverManagerModal } from '../ui/CoinCoverManagerModal.js';
import { EuroFiltersView } from '../ui/EuroFiltersView.js';
import { sortRows, groupRows, computeStats, formatMoney } from '../collection.js';

export const dashboardMethods = {
  getDashboardState() {
    return {
      ...(this.dashboardState || {
        mode: 'all',
        country: '',
        year: '',
        searchText: '',
        sortMode: 'yearAsc',
        groupBy: 'none',
        statsOpen: false,
      }),
    };
  },

  setDashboardState(next) {
    this.dashboardState = { ...this.getDashboardState(), ...next };
  },

  closeFiltersViewIfDashboardClosed() {
    window.setTimeout(() => {
      const hasDashboard = document.querySelector('.twoeuro-view');

      if (hasDashboard) {
        this._dashboardWasOpen = true;
        return;
      }

      /*
       * Close the panel only when the dashboard has just been closed. A panel
       * opened explicitly with the command stays open.
       */
      if (!this._dashboardWasOpen) {
        return;
      }

      this._dashboardWasOpen = false;

      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FILTERS);

      for (const leaf of leaves) {
        leaf.detach();
      }
    }, 100);
  },

  async activateFiltersView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_FILTERS)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_FILTERS, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof EuroFiltersView) leaf.view.render();
  },

  refreshFilterViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_FILTERS)) {
      if (leaf.view instanceof EuroFiltersView) leaf.view.render();
    }
  },

  scheduleDashboardRefresh(delayMs = 300) {
    if (this._refreshTimer) window.clearTimeout(this._refreshTimer);
    this._refreshTimer = window.setTimeout(async () => {
      this._refreshTimer = null;
      if (!document.querySelector('.twoeuro-view')) return;
      await this.refreshDashboards();
    }, delayMs);
  },

  async refreshDashboards() {
    const dashboards = Array.from(document.querySelectorAll('.twoeuro-view'));
    for (const dashboard of dashboards) {
      try {
        const state = this.getDashboardState();
        const replacement = document.createElement('div');
        await this.renderDashboard(replacement, state);
        replacement.className = dashboard.className;
        replacement.style.setProperty(
          '--twoeuro-columns',
          String(Math.min(10, Math.max(4, Number(this.settings.columns) || 6)))
        );
        replacement._twoEuroState = replacement._twoEuroState || state;
        dashboard.replaceWith(replacement);
        window.setTimeout(() => {
          this._lastSavedOverride = null;
        }, 1500);
        this.refreshFilterViews();
      } catch (error) {
        console.error('2 Euro dashboard refresh', error);
      }
    }
  },

  openCoinImagePreview(row, src) {
    if (!src) {
      new CoinModal(this.app, this, row).open();
      return;
    }
    const overlay = document.body.createDiv({ cls: 'twoeuro-preview-overlay' }),
      dialog = document.body.createDiv({ cls: 'twoeuro-preview-dialog' });
    const image = dialog.createEl('img', { attr: { src, alt: row.title || '' } }),
      close = dialog.createEl('button', {
        cls: 'twoeuro-preview-close',
        text: '×',
        attr: { 'aria-label': this.t('preview.close') },
      });
    const finish = () => {
      dialog.remove();
      overlay.remove();
      new CoinModal(this.app, this, row).open();
    };
    overlay.onclick = finish;
    close.onclick = finish;
    dialog.onclick = (event) => event.stopPropagation();
    const esc = (event) => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', esc);
        finish();
      }
    };
    document.addEventListener('keydown', esc);
  },

  buildReferenceCoverIndex(rows) {
    const index = new Map();
    for (const row of rows) {
      const key = [
        countryName(row.country).toLowerCase(),
        tx(row.coin_type).toLowerCase(),
        String(row.year),
      ].join('|');
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(row);
    }
    return index;
  },

  resolveDisplayCover(row, index) {
    const ownSrc = this.coverSrc(row);
    const referenceYear = tx(row.reference_year);
    if (!referenceYear || String(referenceYear) === String(row.year)) {
      return { src: ownSrc, source: row, resolved: Boolean(ownSrc), usesReference: false };
    }
    const key = [
      countryName(row.country).toLowerCase(),
      tx(row.coin_type).toLowerCase(),
      String(referenceYear),
    ].join('|');
    const candidates = index.get(key) || [];
    const sameMint = candidates.find(
      (candidate) =>
        tx(candidate.mint_mark) &&
        tx(candidate.mint_mark) === tx(row.mint_mark) &&
        this.coverSrc(candidate)
    );
    const noMint = candidates.find(
      (candidate) => !tx(candidate.mint_mark) && this.coverSrc(candidate)
    );
    const anyCover = candidates.find((candidate) => this.coverSrc(candidate));
    const source = sameMint || noMint || anyCover || null;
    if (source) {
      return { src: this.coverSrc(source), source, resolved: true, usesReference: true };
    }
    return { src: ownSrc, source: null, resolved: false, usesReference: true };
  },

  async renderDashboard(el, initialState = null) {
    let rows = this.getRows();
    if (this._pendingRowOverrides?.size) {
      rows = rows.map((row) =>
        this._pendingRowOverrides.has(row.file.path)
          ? { ...row, ...this._pendingRowOverrides.get(row.file.path), file: row.file }
          : row
      );
    }
    if (this._lastSavedOverride?.file) {
      rows = rows.map((row) =>
        row.file.path === this._lastSavedOverride.file.path
          ? { ...row, ...this._lastSavedOverride.data, file: row.file }
          : row
      );
    }
    const referenceCoverIndex = this.buildReferenceCoverIndex(rows);
    if (initialState) this.setDashboardState(initialState);
    const state = this.getDashboardState();
    el.empty();
    el.addClass('twoeuro-view');
    el.style.setProperty(
      '--twoeuro-columns',
      String(Math.min(10, Math.max(4, Number(this.settings.columns) || 6)))
    );
    const locale = this.getLanguage() === 'pl' ? 'pl' : 'en';
    const list = sortRows(this.filterRowsByState(rows, state), state.sortMode, locale);
    const header = el.createDiv({ cls: 'twoeuro-header' });
    header.createEl('h2', { text: this.t('collection.title') });
    header.createDiv({
      cls: 'twoeuro-summary',
      text: this.t('summary.owned', {
        owned: list.filter((r) => r.owned).length,
        total: list.length,
      }),
    });
    this.renderStats(el, list, state, locale);
    const groups = groupRows(list, state.groupBy, state.sortMode, locale);
    const grid = el.createDiv({ cls: 'twoeuro-grid' });
    for (const group of groups) {
      if (group.label) {
        const heading = grid.createDiv({ cls: 'twoeuro-group-header' });
        heading.createSpan({ cls: 'twoeuro-group-title', text: group.label });
        heading.createSpan({
          cls: 'twoeuro-group-count',
          text: `${group.owned} / ${group.total}`,
        });
      }
      for (const r of group.rows) this.renderCoinCard(grid, r, referenceCoverIndex);
    }
    el._twoEuroState = this.getDashboardState();
  },

  /*
   * Collapsible statistics for the coins matching the current filters.
   */
  renderStats(el, list, state, locale) {
    const stats = computeStats(list, locale);
    const details = el.createEl('details', { cls: 'twoeuro-stats' });
    details.open = Boolean(state.statsOpen);
    details.addEventListener('toggle', () => this.setDashboardState({ statsOpen: details.open }));
    details.createEl('summary', { text: this.t('stats.title') });
    details.createDiv({ cls: 'twoeuro-stats-scope', text: this.t('stats.scope') });
    const money = (items) =>
      items.length
        ? items.map((item) => formatMoney(item.amount, item.currency, locale)).join(' + ')
        : '–';
    const percent = (owned, total) => (total ? Math.round((owned / total) * 100) : 0);
    const tiles = details.createDiv({ cls: 'twoeuro-stats-tiles' });
    const tile = (label, value, note = '') => {
      const box = tiles.createDiv({ cls: 'twoeuro-stats-tile' });
      box.createDiv({ cls: 'twoeuro-stats-label', text: label });
      box.createDiv({ cls: 'twoeuro-stats-value', text: value });
      if (note) box.createDiv({ cls: 'twoeuro-stats-note', text: note });
    };
    tile(
      this.t('stats.owned'),
      `${stats.owned} / ${stats.total} (${percent(stats.owned, stats.total)}%)`
    );
    tile(
      this.t('stats.value'),
      money(stats.value),
      stats.valueMissing ? this.t('stats.valueMissing', { count: stats.valueMissing }) : ''
    );
    tile(
      this.t('stats.spent'),
      money(stats.spent),
      stats.spentMissing ? this.t('stats.spentMissing', { count: stats.spentMissing }) : ''
    );
    tile(
      this.t('stats.swap'),
      String(stats.swapCoins),
      stats.swapCoins ? this.t('stats.swapPieces', { count: stats.swapPieces }) : ''
    );
    const tables = details.createDiv({ cls: 'twoeuro-stats-tables' });
    const table = (title, items) => {
      const section = tables.createDiv({ cls: 'twoeuro-stats-table' });
      section.createDiv({ cls: 'twoeuro-stats-label', text: title });
      for (const item of items) {
        const line = section.createDiv({ cls: 'twoeuro-stats-row' });
        line.createSpan({ cls: 'twoeuro-stats-name', text: item.key || '–' });
        const bar = line.createDiv({ cls: 'twoeuro-stats-bar' });
        bar.createDiv({ cls: 'twoeuro-stats-fill' }).style.width =
          `${percent(item.owned, item.total)}%`;
        line.createSpan({ cls: 'twoeuro-stats-count', text: `${item.owned} / ${item.total}` });
      }
    };
    table(this.t('stats.byCountry'), stats.byCountry);
    table(this.t('stats.byYear'), stats.byYear);
  },

  renderCoinCard(grid, r, referenceCoverIndex) {
    const card = grid.createDiv({
      cls: `twoeuro-card ${r.owned ? 'is-owned' : 'is-missing'} ${(this.selectedCoinPaths || new Set()).has(r.file.path) ? 'is-selected' : ''}`,
    });
    const selectWrap = card.createDiv({ cls: 'twoeuro-card-select' }),
      selectBox = selectWrap.createEl('input', {
        attr: { type: 'checkbox', 'aria-label': this.t('sidebar.selected', { count: 1 }) },
      });
    selectBox.checked = (this.selectedCoinPaths || new Set()).has(r.file.path);
    selectWrap.onclick = (e) => e.stopPropagation();
    selectBox.onclick = (e) => e.stopPropagation();
    selectBox.onchange = () => {
      this.toggleCoinSelection(r.file.path, selectBox.checked);
      card.toggleClass('is-selected', selectBox.checked);
    };
    const cover = card.createDiv({ cls: 'twoeuro-cover' }),
      coverResolution = this.resolveDisplayCover(r, referenceCoverIndex),
      src = coverResolution.src;
    let indicatorClass = r.own_cover ? 'is-own-cover' : 'is-missing-reference',
      indicatorTitle = r.own_cover ? this.t('indicator.ownCover') : this.t('indicator.missing');
    if (!r.own_cover && r.reference_year) {
      if (String(r.reference_year) === String(r.year)) {
        indicatorClass = 'is-exact';
        indicatorTitle = this.t('indicator.exact');
      } else if (coverResolution.resolved && coverResolution.source) {
        indicatorClass = 'is-reference';
        indicatorTitle = this.t('indicator.reference', {
          country: coverResolution.source.country,
          type: coverResolution.source.coin_type,
          year: coverResolution.source.year,
        });
      } else {
        indicatorTitle = this.t('indicator.notFound', { year: r.reference_year });
      }
    }
    const indicator = cover.createDiv({ cls: `twoeuro-image-indicator ${indicatorClass}` });
    indicator.setAttribute('title', indicatorTitle);
    if (src)
      cover.createEl('img', {
        attr: {
          src,
          alt: r.title,
          // Load covers only when the card scrolls into view (faster on large collections).
          loading: 'lazy',
          decoding: 'async',
          title:
            coverResolution.usesReference && coverResolution.source
              ? this.t('image.reference', { year: coverResolution.source.year })
              : r.title,
        },
      });
    else cover.createDiv({ cls: 'twoeuro-placeholder', text: '2 €' });
    const info = card.createDiv({ cls: 'twoeuro-info' });
    info.createDiv({ cls: 'twoeuro-country', text: r.country });
    info.createDiv({ cls: 'twoeuro-title', text: r.title });
    info.createDiv({
      cls: 'twoeuro-meta',
      text: `${r.year} · ${r.coin_type === 'national' ? this.t('coin.national') : this.t('coin.commemorative')}${r.mint_mark ? ` · ${r.mint_mark}` : ''}`,
    });
    const quantity = Number(r.quantity) || 1;
    info.createDiv({
      cls: 'twoeuro-status',
      text: r.owned
        ? `✓ ${this.t('status.owned')}${quantity > 1 ? ` ×${quantity}` : ''}`
        : `○ ${this.t('status.missing')}`,
    });
    cover.onclick = (event) => {
      event.stopPropagation();
      this.currentCoinFile = r.file;
      new CoinCoverManagerModal(this.app, this, r, src).open();
    };
    info.onclick = (event) => {
      event.stopPropagation();
      this.currentCoinFile = r.file;
      new CoinModal(this.app, this, r).open();
    };
  },
};
