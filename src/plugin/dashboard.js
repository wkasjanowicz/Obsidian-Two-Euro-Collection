import { VIEW_TYPE_FILTERS } from '../constants.js';
import { tx, countryName } from '../utils.js';
import { CoinModal } from '../ui/CoinModal.js';
import { CoinCoverManagerModal } from '../ui/CoinCoverManagerModal.js';
import { EuroFiltersView } from '../ui/EuroFiltersView.js';

export const dashboardMethods = {
  getDashboardState() {
    return {
      ...(this.dashboardState || {
        mode: 'all',
        country: '',
        year: '',
        searchText: '',
        sortMode: 'yearAsc',
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
    const header = el.createDiv({ cls: 'twoeuro-header' });
    header.createEl('h2', { text: this.t('collection.title') });
    const summary = header.createDiv({ cls: 'twoeuro-summary' });
    const grid = el.createDiv({ cls: 'twoeuro-grid' });
    const list = this.filterRowsByState(rows, state);
    const locale = this.getLanguage() === 'pl' ? 'pl' : 'en';
    list.sort((a, b) => {
      const yearA = Number(a.year) || 0,
        yearB = Number(b.year) || 0,
        countryCmp = String(a.country || '').localeCompare(String(b.country || ''), locale, {
          sensitivity: 'base',
        }),
        titleCmp = String(a.title || '').localeCompare(String(b.title || ''), locale, {
          numeric: true,
          sensitivity: 'base',
        }),
        mintCmp = String(a.mint_mark || '').localeCompare(String(b.mint_mark || ''), locale, {
          numeric: true,
          sensitivity: 'base',
        });
      if (state.sortMode === 'yearDesc') return yearB - yearA || countryCmp || titleCmp || mintCmp;
      if (state.sortMode === 'countryAsc')
        return countryCmp || yearA - yearB || titleCmp || mintCmp;
      if (state.sortMode === 'countryDesc')
        return -countryCmp || yearA - yearB || titleCmp || mintCmp;
      return yearA - yearB || countryCmp || titleCmp || mintCmp;
    });
    summary.setText(
      this.t('summary.owned', { owned: list.filter((r) => r.owned).length, total: list.length })
    );
    for (const r of list) {
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
      info.createDiv({
        cls: 'twoeuro-status',
        text: r.owned ? `✓ ${this.t('status.owned')}` : `○ ${this.t('status.missing')}`,
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
    }
    el._twoEuroState = this.getDashboardState();
  },
};
