import { Setting, Modal, Notice } from 'obsidian';
import { tx, clean, isTrue } from '../utils.js';

export class CoinCoverManagerModal extends Modal {
  constructor(app, plugin, row, displaySrc = '') {
    super(app);
    this.plugin = plugin;
    this.row = row;
    this.displaySrc = displaySrc;
    this.form = null;
  }
  async onOpen() {
    this.modalEl.addClass('twoeuro-cover-manager-modal');
    await this.render();
  }
  buildEditableForm(container, fresh) {
    const p = this.plugin,
      t = (k, v) => p.t(k, v),
      f = { ...fresh };
    this.form = f;
    const input = (key, field, ph = '', desc = '') => {
      const item = new Setting(container).setName(t(key));
      if (desc) item.setDesc(t(desc));
      item.addText((x) =>
        x
          .setValue(tx(f[field]))
          .setPlaceholder(ph ? t(ph) : '')
          .onChange((v) => (f[field] = v))
      );
    };
    input('coin.country', 'country');
    input('coin.year', 'year');
    input('coin.title', 'title');
    new Setting(container).setName(t('coin.type')).addDropdown((d) =>
      d
        .addOption('commemorative', t('coin.commemorative'))
        .addOption('national', t('coin.national'))
        .setValue(f.coin_type || 'commemorative')
        .onChange((v) => (f.coin_type = v))
    );
    input('coin.mint', 'mint_mark');
    new Setting(container)
      .setName(t('coin.owned'))
      .addToggle((x) => x.setValue(isTrue(f.owned)).onChange((v) => (f.owned = v)));
    input('coin.quantity', 'quantity');
    input('coin.date', 'acquisition_date');
    input('coin.price', 'acquisition_price');
    input('coin.currency', 'acquisition_currency');
    input('coin.condition', 'condition');
    input('coin.coverUrl', 'cover_url');
    const ref = new Setting(container)
        .setName(t('coin.referenceYear'))
        .setDesc(t('coin.referenceYearDesc')),
      listId = `cover-manager-years-${Date.now()}`,
      list = container.createEl('datalist', { attr: { id: listId } });
    for (const year of p.getReferenceYearSuggestions(f, fresh.file))
      list.createEl('option', { attr: { value: String(year) } });
    ref.addText((x) => {
      x.setValue(tx(f.reference_year)).setPlaceholder(t('coin.referenceYearPh'));
      x.inputEl.setAttribute('list', listId);
      x.onChange((v) => (f.reference_year = v));
    });
    new Setting(container)
      .setName(t('coin.coverLocked'))
      .setDesc(t('coin.coverLockedDesc'))
      .addToggle((x) => x.setValue(isTrue(f.cover_locked)).onChange((v) => (f.cover_locked = v)));
    new Setting(container)
      .setName(t('coin.ownCover'))
      .setDesc(t('coin.ownCoverDesc'))
      .addToggle((x) =>
        x.setValue(isTrue(f.own_cover)).onChange((v) => {
          f.own_cover = v;
          if (v) f.cover_locked = true;
        })
      );
    new Setting(container)
      .setName(t('coin.notes'))
      .addTextArea((x) => x.setValue(tx(f.notes)).onChange((v) => (f.notes = v)));
    input('coin.photoAuthor', 'photo_author');
    input('coin.photoLicense', 'photo_license');
    new Setting(container)
      .setName(t('coin.numismaticValue'))
      .setDesc(t('coin.numismaticValueDesc'))
      .addTextArea((x) => {
        x.setValue(p.formatNumismaticValue(f));
        x.inputEl.readOnly = true;
      });
  }
  render() {
    const p = this.plugin,
      t = (k, v) => p.t(k, v),
      c = this.contentEl;
    c.empty();
    c.addClass('twoeuro-cover-manager');
    const fresh = p.getRows().find((r) => r.file.path === this.row.file.path) || this.row;
    this.row = fresh;
    c.createEl('h2', { text: t('coverManager.title') });
    const layout = c.createDiv({ cls: 'twoeuro-cover-manager-layout' }),
      left = layout.createDiv({ cls: 'twoeuro-cover-manager-left' }),
      right = layout.createDiv({ cls: 'twoeuro-cover-manager-data' }),
      preview = left.createDiv({ cls: 'twoeuro-cover-manager-preview' }),
      resolved = p.resolveDisplayCover(fresh, p.buildReferenceCoverIndex(p.getRows())),
      src = p.coverSrc(fresh) || resolved.src || this.displaySrc;
    if (src) preview.createEl('img', { attr: { src, alt: fresh.title || '' } });
    else preview.createDiv({ cls: 'twoeuro-placeholder', text: '2 €' });
    right.createEl('h3', {
      cls: 'twoeuro-cover-manager-section',
      text: t('coverManager.dataSection'),
    });
    this.buildEditableForm(right, fresh);
    const saveRow = async () => {
      if (!clean(this.form.country) || !tx(this.form.year) || !clean(this.form.title))
        throw new Error(t('error.required'));
      await p.snapshotCoinState(fresh);
      await p.upsert(this.form, fresh.file, { rename: true });
      await p.refreshDashboards();
    };
    const run = async (fn) => {
      try {
        await fn();
        await p.refreshDashboards();
        p.refreshFilterViews();
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        const freshAfter = await p.readCoinRowFresh(this.row.file);
        if (freshAfter) this.row = freshAfter;
        await this.render();
      } catch (error) {
        console.error('Coin cover manager', error);
        new Notice(error?.message || String(error));
      }
    };
    const saveActions = right.createDiv({ cls: 'twoeuro-cover-manager-save' });
    saveActions.createEl('button', { text: t('coverManager.save'), cls: 'mod-cta' }).onclick =
      async () => {
        try {
          await saveRow();
          await p.refreshDashboards();
          p.refreshFilterViews();
          new Notice(t('notice.saved'));
          this.close();
        } catch (error) {
          console.error('Coin cover manager save', error);
          new Notice(error?.message || String(error));
        }
      };
    left.createEl('h3', {
      cls: 'twoeuro-cover-manager-section',
      text: t('coverManager.coverSection'),
    });
    const coverActions = left.createDiv({ cls: 'twoeuro-cover-manager-action-group' });
    coverActions.createEl('button', { text: t('coverManager.background') }).onclick = () =>
      run(async () => {
        await p.snapshotCoinState(fresh);
        await p.processBackgroundForRow(fresh);
      });
    coverActions.createEl('button', { text: t('coverManager.catalog') }).onclick = () =>
      run(async () => {
        await p.snapshotCoinState(fresh);
        await p.processCatalogPresetForRow(fresh);
      });
    const fileInput = c.createEl('input', { attr: { type: 'file', accept: 'image/*' } });
    fileInput.addClass('twoeuro-cover-manager-file');
    fileInput.onchange = () =>
      run(async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        await p.snapshotCoinState(fresh);
        await p.loadCustomCoverFromDisk(fresh, file);
        new Notice(t('coverManager.diskDone'));
      });
    coverActions.createEl('button', { text: t('coverManager.disk') }).onclick = () =>
      fileInput.click();
    left.createEl('h3', {
      cls: 'twoeuro-cover-manager-section',
      text: t('coverManager.numistaSection'),
    });
    const numista = left.createDiv({ cls: 'twoeuro-cover-manager-action-group' });
    numista.createEl('button', { text: t('coverManager.numistaCover') }).onclick = () =>
      run(async () => {
        await p.snapshotCoinState(fresh);
        await p.downloadNumistaCoverForCoin(fresh);
        new Notice(t('coverManager.numistaCoverDone'));
      });
    numista.createEl('button', { text: t('coverManager.numistaData') }).onclick = () =>
      run(async () => {
        await p.snapshotCoinState(fresh);
        await p.updateSingleCoinFromNumista(fresh);
        new Notice(t('coverManager.numistaDone'));
      });
    left.createEl('h3', {
      cls: 'twoeuro-cover-manager-section',
      text: t('coverManager.historySection'),
    });
    const history = left.createDiv({ cls: 'twoeuro-cover-manager-action-group' });
    history.createEl('button', { text: t('coverManager.undo') }).onclick = () =>
      run(async () => {
        const ok = await p.undoCoinChange(fresh);
        new Notice(ok ? t('coverManager.undoDone') : t('coverManager.noUndo'));
      });
    history.createEl('button', { text: t('coverManager.close') }).onclick = () => this.close();
    return Promise.resolve();
  }
  onClose() {
    this.contentEl.empty();
    void this.plugin.refreshDashboards();
  }
}
