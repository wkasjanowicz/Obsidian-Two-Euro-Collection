import { Setting, Modal, Notice, TFile } from 'obsidian';
import { tx, clean, isTrue } from '../utils.js';

export class CoinModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {import('../types').TwoEuroPlugin} plugin
   * @param {import('../types').CoinRow | null} [row]
   */
  constructor(app, plugin, row) {
    super(app);
    this.plugin = plugin;
    this.row = row || null;
    if (this.row?.file instanceof TFile) this.plugin.currentCoinFile = this.row.file;
  }
  onOpen() {
    const p = this.plugin,
      t = (/** @type {string} */ k, /** @type {Record<string, unknown>} */ v = {}) => p.t(k, v),
      c = this.contentEl,
      /** @type {import('../types').CoinData} */
      f = this.row
        ? { ...this.row }
        : {
            country: '',
            year: '',
            title: '',
            coin_type: 'commemorative',
            mint_mark: '',
            owned: false,
            quantity: 1,
            acquisition_date: '',
            acquisition_price: '',
            acquisition_currency: p.settings.defaultCurrency || 'PLN',
            condition: '',
            notes: '',
            cover_url: '',
            reference_year: '',
            cover_locked: false,
            own_cover: false,
          };
    c.empty();
    c.createEl('h2', { text: t(this.row ? 'coin.edit' : 'coin.add') });
    /**
     * @param {string} key
     * @param {string} field
     */
    const input = (key, field, ph = '', desc = '') => {
      const setting = new Setting(c).setName(t(key));
      if (desc) setting.setDesc(t(desc));
      setting.addText((x) =>
        x
          .setValue(tx(f[field]))
          .setPlaceholder(ph ? t(ph) : '')
          .onChange((v) => (f[field] = v))
      );
      return setting;
    };
    input('coin.country', 'country');
    input('coin.year', 'year');
    input('coin.title', 'title');
    new Setting(c).setName(t('coin.type')).addDropdown((d) =>
      d
        .addOption('commemorative', t('coin.commemorative'))
        .addOption('national', t('coin.national'))
        .setValue(f.coin_type || 'commemorative')
        .onChange((v) => {
          f.coin_type = v;
        })
    );
    input('coin.mint', 'mint_mark');
    new Setting(c)
      .setName(t('coin.owned'))
      .addToggle((x) => x.setValue(isTrue(f.owned)).onChange((v) => (f.owned = v)));
    input('coin.quantity', 'quantity');
    input('coin.date', 'acquisition_date');
    input('coin.price', 'acquisition_price');
    input('coin.currency', 'acquisition_currency');
    input('coin.condition', 'condition');
    input('coin.coverUrl', 'cover_url');
    const referenceSetting = new Setting(c)
      .setName(t('coin.referenceYear'))
      .setDesc(t('coin.referenceYearDesc'));
    const datalistId = `twoeuro-reference-years-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const datalist = c.createEl('datalist', { attr: { id: datalistId } });
    const updateReferenceSuggestions = () => {
      datalist.empty();
      const years = p.getReferenceYearSuggestions(f, this.row?.file);
      for (const year of years) datalist.createEl('option', { attr: { value: String(year) } });
    };
    referenceSetting.addText((text) => {
      text.setValue(tx(f.reference_year)).setPlaceholder(t('coin.referenceYearPh'));
      text.inputEl.setAttribute('list', datalistId);
      text.inputEl.setAttribute('inputmode', 'numeric');
      text.inputEl.addEventListener('focus', updateReferenceSuggestions);
      text.onChange((value) => {
        f.reference_year = value;
      });
    });
    updateReferenceSuggestions();
    new Setting(c)
      .setName(t('coin.coverLocked'))
      .setDesc(t('coin.coverLockedDesc'))
      .addToggle((x) => x.setValue(isTrue(f.cover_locked)).onChange((v) => (f.cover_locked = v)));
    new Setting(c)
      .setName(t('coin.ownCover'))
      .setDesc(t('coin.ownCoverDesc'))
      .addToggle((x) =>
        x.setValue(isTrue(f.own_cover)).onChange((v) => {
          f.own_cover = v;
          if (v) f.cover_locked = true;
        })
      );
    input('coin.photoAuthor', 'photo_author');
    input('coin.photoLicense', 'photo_license');
    new Setting(c)
      .setName(t('coin.numismaticValue'))
      .setDesc(t('coin.numismaticValueDesc'))
      .addTextArea((x) => {
        x.setValue(p.formatNumismaticValue(f));
        x.inputEl.readOnly = true;
      });
    new Setting(c)
      .setName(t('coin.notes'))
      .addTextArea((x) => x.setValue(tx(f.notes)).onChange((v) => (f.notes = v)));
    const actions = c.createDiv({ cls: 'twoeuro-actions' });
    actions.createEl('button', { text: t('action.cancel') }).onclick = () => this.close();
    actions.createEl('button', { text: t('action.save'), cls: 'mod-cta' }).onclick = async () => {
      if (!clean(f.country) || !tx(f.year) || !clean(f.title)) {
        new Notice(t('error.required'));
        return;
      }
      await p.upsert(f, this.row && this.row.file, { rename: true });
      await p.refreshDashboards();
      new Notice(t('notice.saved'));
      this.close();
    };
  }
}
