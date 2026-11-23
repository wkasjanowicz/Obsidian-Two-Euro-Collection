import { Notice, TFile } from 'obsidian';
import { sortRows, toCsv } from '../collection.js';

const KINDS = {
  missing: { title: 'export.titleMissing', file: 'export.fileMissing' },
  owned: { title: 'export.titleOwned', file: 'export.fileOwned' },
  swap: { title: 'export.titleSwap', file: 'export.fileSwap' },
};

export const exportMethods = {
  exportMissingCoins() {
    return this.exportCoinList('missing');
  },

  /*
   * Writes a coin list (missing, owned or for swap) within the current
   * country / year / type / search filters to a Markdown checklist and a CSV
   * file in the collection folder, then opens the Markdown note.
   */
  async exportCoinList(kind = 'missing') {
    const config = KINDS[kind] || KINDS.missing;
    const state = this.getDashboardState();
    const scopeState = {
      ...state,
      mode: ['commemorative', 'national'].includes(state.mode) ? state.mode : 'all',
    };
    const locale = this.getLanguage() === 'pl' ? 'pl' : 'en';
    const quantity = (row) => Math.max(1, Number(row.quantity) || 1);
    const select =
      {
        missing: (row) => !row.owned,
        owned: (row) => row.owned,
        swap: (row) => row.owned && quantity(row) > 1,
      }[kind] || ((row) => !row.owned);
    const items = sortRows(
      this.filterRowsByState(this.getRows(), scopeState).filter(select),
      'countryAsc',
      locale
    );
    if (!items.length) {
      new Notice(this.t('notice.exportNone'));
      return null;
    }
    const pieces = (row) =>
      kind === 'swap' ? quantity(row) - 1 : kind === 'owned' ? quantity(row) : null;
    const date = new Date().toISOString().slice(0, 10);
    const typeLabel = (row) =>
      row.coin_type === 'national' ? this.t('coin.national') : this.t('coin.commemorative');
    const scopeParts = [state.country, state.year, state.searchText ? `"${state.searchText}"` : '']
      .concat(scopeState.mode !== 'all' ? [this.t(`filter.${scopeState.mode}`)] : [])
      .filter(Boolean);
    const scope = scopeParts.length ? scopeParts.join(' · ') : this.t('export.scopeAll');

    const lines = [
      `# ${this.t(config.title)}`,
      '',
      this.t('export.scope', { scope }),
      this.t('export.generated', { date, count: items.length }),
      '',
    ];
    let currentCountry = null;
    for (const row of items) {
      if (row.country !== currentCountry) {
        currentCountry = row.country;
        const count = items.filter((item) => item.country === currentCountry).length;
        lines.push(`## ${currentCountry} (${count})`, '');
      }
      const parts = [row.year, row.title, typeLabel(row)];
      if (row.mint_mark) parts.push(row.mint_mark);
      if (pieces(row) !== null) parts.push(`×${pieces(row)}`);
      const link = row.numista_url ? ` · [Numista](${row.numista_url})` : '';
      lines.push(`- [ ] ${parts.join(' · ')}${link}`);
    }
    const markdown = `${lines.join('\n')}\n`;

    const header = this.t('export.columns').split(',');
    if (kind === 'owned') header.push(this.t('export.columnQuantity'));
    if (kind === 'swap') header.push(this.t('export.columnSpare'));
    const csv = toCsv(
      header,
      items.map((row) => {
        const record = [
          row.country,
          row.year,
          typeLabel(row),
          row.title,
          row.mint_mark,
          row.numista_id,
          row.numista_url,
        ];
        if (pieces(row) !== null) record.push(pieces(row));
        return record;
      })
    );

    await this.ensureStructure();
    const base = this.join(this.root(), this.t(config.file, { date }));
    const write = async (path, content) => {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) await this.app.vault.modify(existing, content);
      else await this.app.vault.create(path, content);
      return this.app.vault.getAbstractFileByPath(path);
    };
    const mdFile = await write(`${base}.md`, markdown);
    // BOM so that Excel opens the UTF-8 file with correct national characters.
    await write(`${base}.csv`, `\uFEFF${csv}`);
    const name = base.split('/').pop();
    new Notice(
      this.t('notice.exportDone', { count: items.length, md: `${name}.md`, csv: `${name}.csv` })
    );
    if (mdFile instanceof TFile && this.app.workspace.getLeaf)
      await this.app.workspace.getLeaf(true).openFile(mdFile);
    return { count: items.length, markdownPath: `${base}.md`, csvPath: `${base}.csv` };
  },
};
