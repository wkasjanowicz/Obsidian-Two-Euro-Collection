import { ItemView } from 'obsidian';
import { VIEW_TYPE_FILTERS } from '../constants.js';
import { CoinModal } from './CoinModal.js';

export class EuroFiltersView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_FILTERS;
  }
  getDisplayText() {
    return this.plugin.t('sidebar.title');
  }
  getIcon() {
    return 'sliders-horizontal';
  }
  async onOpen() {
    this.render();
  }
  render() {
    const p = this.plugin,
      t = (k, v) => p.t(k, v),
      c = this.contentEl;
    c.empty();
    c.addClass('twoeuro-sidebar');
    c.createEl('h3', { cls: 'twoeuro-sidebar-section-title', text: t('sidebar.actions') });
    const actions = c.createDiv({ cls: 'twoeuro-sidebar-actions' });
    actions.createEl('button', { text: `+ ${t('action.add')}`, cls: 'mod-cta' }).onclick = () =>
      new CoinModal(this.app, p).open();
    actions.createEl('button', {
      text: t('action.sync'),
    }).onclick = () => p.syncNumista();
    actions.createEl('button', {
      text: t('action.syncFiltered'),
    }).onclick = () => p.syncNumista(p.getNumistaSyncScope());
    actions.createEl('button', { text: t('action.downloadCovers') }).onclick = () =>
      p.backfillCovers();
    actions.createEl('button', { text: t('action.updatePrices') }).onclick = () =>
      p.updateNumistaPrices();
    actions.createEl('button', { text: t('action.exportMissing') }).onclick = () =>
      p.exportMissingCoins();
    const selectedCount = p.getSelectedCoinFiles().length;
    c.createDiv({
      cls: 'twoeuro-sidebar-selected',
      text: t('sidebar.selected', { count: selectedCount }),
    });
    const batch = c.createDiv({ cls: 'twoeuro-sidebar-batch-actions' });
    const imageAction = c.createDiv({ cls: 'twoeuro-sidebar-image-action' });
    imageAction.createDiv({ cls: 'twoeuro-sidebar-label', text: t('action.imagePreset') });
    const imagePreset = imageAction.createEl('select', { cls: 'twoeuro-sidebar-select' });
    imagePreset.createEl('option', {
      text: t('action.removeBackgroundSelected'),
      attr: { value: 'background' },
    });
    imagePreset.createEl('option', {
      text: t('action.catalogPresetSelected'),
      attr: { value: 'catalog' },
    });
    // Default: background removal; the choice is remembered until Obsidian restarts.
    imagePreset.value = p.imagePreset === 'catalog' ? 'catalog' : 'background';
    imagePreset.onchange = () => {
      p.imagePreset = imagePreset.value;
    };
    const processBtn = imageAction.createEl('button', {
      text: t('action.processImage'),
      cls: 'twoeuro-sidebar-process',
    });
    processBtn.disabled = selectedCount === 0;
    processBtn.onclick = () => p.processSelectedImages(imagePreset.value);
    const duplicateBtn = batch.createEl('button', { text: t('action.duplicateSelected') });
    duplicateBtn.disabled = selectedCount === 0;
    duplicateBtn.onclick = () => p.duplicateSelectedCoins();
    const deleteBtn = batch.createEl('button', { text: t('action.deleteSelected') });
    deleteBtn.disabled = selectedCount === 0;
    deleteBtn.onclick = () => p.deleteSelectedCoins();
    const clearBtn = c.createEl('button', {
      text: t('sidebar.clearSelection'),
      cls: 'twoeuro-sidebar-clear',
    });
    clearBtn.disabled = selectedCount === 0;
    clearBtn.onclick = () => {
      p.clearCoinSelection();
      p.refreshDashboards();
      p.refreshFilterViews();
    };
    c.createEl('hr');
    c.createEl('h3', { cls: 'twoeuro-sidebar-section-title', text: t('sidebar.filtersSorting') });
    const rows = p.getRows(),
      state = p.getDashboardState();
    c.createDiv({ cls: 'twoeuro-sidebar-label', text: t('filter.search') });
    const search = c.createEl('input', {
      cls: 'twoeuro-sidebar-search',
      attr: { type: 'search', placeholder: t('filter.search') },
    });
    search.value = state.searchText || '';
    c.createDiv({ cls: 'twoeuro-sidebar-label', text: t('coin.country') });
    const country = c.createEl('select', { cls: 'twoeuro-sidebar-select' });
    country.createEl('option', { text: t('filter.countries'), attr: { value: '' } });
    p.getReferenceIssuers().forEach((value) => {
      country.createEl('option', {
        text: value,
        attr: {
          value,
        },
      });
    });
    country.value = state.country || '';
    c.createDiv({ cls: 'twoeuro-sidebar-label', text: t('coin.year') });
    const year = c.createEl('select', { cls: 'twoeuro-sidebar-select' });
    year.createEl('option', { text: t('filter.years'), attr: { value: '' } });
    p.getReferenceYears().forEach((value) => {
      year.createEl('option', {
        text: value,
        attr: {
          value,
        },
      });
    });
    year.value = state.year || '';
    c.createDiv({ cls: 'twoeuro-sidebar-label', text: t('coin.type') });
    const mode = c.createEl('select', { cls: 'twoeuro-sidebar-select' });
    [
      ['all', 'filter.all'],
      ['owned', 'filter.owned'],
      ['missing', 'filter.missing'],
      ['commemorative', 'filter.commemorative'],
      ['national', 'filter.national'],
      ['swap', 'filter.swap'],
    ].forEach(([v, k]) => mode.createEl('option', { text: t(k), attr: { value: v } }));
    mode.value = state.mode || 'all';
    c.createDiv({ cls: 'twoeuro-sidebar-label', text: t('sort.label') });
    const sort = c.createEl('select', { cls: 'twoeuro-sidebar-select' });
    [
      ['yearAsc', 'sort.yearAsc'],
      ['yearDesc', 'sort.yearDesc'],
      ['countryAsc', 'sort.countryAsc'],
      ['countryDesc', 'sort.countryDesc'],
    ].forEach(([v, k]) => sort.createEl('option', { text: t(k), attr: { value: v } }));
    sort.value = state.sortMode || 'yearAsc';
    c.createDiv({ cls: 'twoeuro-sidebar-label', text: t('group.label') });
    const groupBy = c.createEl('select', { cls: 'twoeuro-sidebar-select' });
    [
      ['none', 'group.none'],
      ['country', 'group.country'],
      ['year', 'group.year'],
    ].forEach(([v, k]) => groupBy.createEl('option', { text: t(k), attr: { value: v } }));
    groupBy.value = state.groupBy || 'none';
    c.createEl('hr');
    c.createEl('h3', { cls: 'twoeuro-sidebar-section-title', text: t('sidebar.configuration') });
    c.createDiv({ cls: 'twoeuro-sidebar-label', text: t('settings.columns') });
    const columnsWrap = c.createDiv({ cls: 'twoeuro-sidebar-slider-row' });
    const columns = columnsWrap.createEl('input', {
      attr: {
        type: 'range',
        min: '4',
        max: '10',
        step: '1',
        value: String(Number(p.settings.columns) || 6),
      },
    });
    const columnsValue = columnsWrap.createSpan({
      cls: 'twoeuro-sidebar-slider-value',
      text: String(Number(p.settings.columns) || 6),
    });
    c.createDiv({ cls: 'twoeuro-sidebar-label', text: t('settings.language') });
    const language = c.createEl('select', { cls: 'twoeuro-sidebar-select' });
    language.createEl('option', { text: t('settings.auto'), attr: { value: 'auto' } });
    for (const lang of p.getAvailableLanguages())
      language.createEl('option', { text: lang.name, attr: { value: lang.code } });
    language.value = p.settings.language || 'auto';
    const apply = () => {
      p.setDashboardState({
        mode: mode.value,
        country: country.value,
        year: year.value,
        searchText: search.value,
        sortMode: sort.value,
        groupBy: groupBy.value,
      });
      p.refreshDashboards();
    };
    search.oninput = apply;
    country.onchange = apply;
    year.onchange = apply;
    mode.onchange = apply;
    sort.onchange = apply;
    groupBy.onchange = apply;
    columns.oninput = () => {
      columnsValue.setText(String(Math.min(10, Math.max(4, Number(columns.value) || 6))));
    };
    columns.onchange = async () => {
      const value = Math.min(10, Math.max(4, Number(columns.value) || 6));
      columnsValue.setText(String(value));
      p.settings.columns = value;
      await p.saveSettings();
      await p.refreshDashboards();
    };
    language.onchange = async () => {
      p.settings.language = language.value;
      await p.saveSettings();
      await p.refreshDashboards();
      p.refreshFilterViews();
    };
  }
}
