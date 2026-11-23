import { Notice, TFile } from 'obsidian';
import { sortRows, toCsv } from '../collection.js';

export const exportMethods = {
  /*
   * Writes the coins missing from the collection (within the current
   * country / year / type / search filters) to a Markdown checklist and a CSV
   * file in the collection folder, then opens the Markdown note.
   */
  async exportMissingCoins() {
    const state = this.getDashboardState();
    const scopeState = {
      ...state,
      mode: ['commemorative', 'national'].includes(state.mode) ? state.mode : 'all',
    };
    const locale = this.getLanguage() === 'pl' ? 'pl' : 'en';
    const missing = sortRows(
      this.filterRowsByState(this.getRows(), scopeState).filter((row) => !row.owned),
      'countryAsc',
      locale
    );
    if (!missing.length) {
      new Notice(this.t('notice.exportNone'));
      return null;
    }
    const date = new Date().toISOString().slice(0, 10);
    const typeLabel = (row) =>
      row.coin_type === 'national' ? this.t('coin.national') : this.t('coin.commemorative');
    const scopeParts = [state.country, state.year, state.searchText ? `"${state.searchText}"` : '']
      .concat(scopeState.mode !== 'all' ? [this.t(`filter.${scopeState.mode}`)] : [])
      .filter(Boolean);
    const scope = scopeParts.length ? scopeParts.join(' · ') : this.t('export.scopeAll');

    const lines = [
      `# ${this.t('export.title')}`,
      '',
      this.t('export.scope', { scope }),
      this.t('export.generated', { date, count: missing.length }),
      '',
    ];
    let currentCountry = null;
    for (const row of missing) {
      if (row.country !== currentCountry) {
        currentCountry = row.country;
        const count = missing.filter((item) => item.country === currentCountry).length;
        lines.push(`## ${currentCountry} (${count})`, '');
      }
      const parts = [row.year, row.title, typeLabel(row)];
      if (row.mint_mark) parts.push(row.mint_mark);
      const link = row.numista_url ? ` · [Numista](${row.numista_url})` : '';
      lines.push(`- [ ] ${parts.join(' · ')}${link}`);
    }
    const markdown = `${lines.join('\n')}\n`;

    const header = this.t('export.columns').split(',');
    const csv = toCsv(
      header,
      missing.map((row) => [
        row.country,
        row.year,
        typeLabel(row),
        row.title,
        row.mint_mark,
        row.numista_id,
        row.numista_url,
      ])
    );

    await this.ensureStructure();
    const base = this.join(this.root(), this.t('export.fileName', { date }));
    const write = async (path, content) => {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) await this.app.vault.modify(existing, content);
      else await this.app.vault.create(path, content);
      return this.app.vault.getAbstractFileByPath(path);
    };
    const mdFile = await write(`${base}.md`, markdown);
    // BOM so that Excel opens the UTF-8 file with correct Polish characters.
    await write(`${base}.csv`, `﻿${csv}`);
    new Notice(
      this.t('notice.exportDone', {
        count: missing.length,
        md: `${base.split('/').pop()}.md`,
        csv: `${base.split('/').pop()}.csv`,
      })
    );
    if (mdFile instanceof TFile && this.app.workspace.getLeaf)
      await this.app.workspace.getLeaf(true).openFile(mdFile);
    return { count: missing.length, markdownPath: `${base}.md`, csvPath: `${base}.csv` };
  },
};
