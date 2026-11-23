import { TFile, parseYaml, stringifyYaml } from 'obsidian';
import { tx, clean, isTrue, toNum, normalizeCoinTitle, countryName } from '../utils.js';

export const coinsMethods = {
  notePath(d) {
    return this.join(
      this.coins(),
      clean(countryName(d.country)),
      `${clean(d.year)} - ${clean(d.title)}${d.mint_mark ? ` - ${clean(d.mint_mark)}` : ''}.md`
    );
  },

  async upsert(d, file, options = {}) {
    await this.ensureStructure();
    const country = countryName(d.country);
    await this.ensureFolder(this.join(this.coins(), clean(country)));
    const fm = {
      coin_id: d.coin_id || `coin-${d.numista_id || Date.now()}-${d.numista_issue_id || ''}`,
      denomination: 2,
      currency: 'EUR',
      country,
      year: tx(d.year),
      coin_type: d.coin_type || 'commemorative',
      title: normalizeCoinTitle(d.title),
      mint_mark: tx(d.mint_mark) || undefined,
      owned: isTrue(d.owned),
      quantity: Number(d.quantity) || 1,
      acquisition_date: tx(d.acquisition_date) || undefined,
      acquisition_price: toNum(d.acquisition_price),
      acquisition_currency: tx(d.acquisition_currency) || 'PLN',
      condition: tx(d.condition) || undefined,
      notes: tx(d.notes) || undefined,
      source: d.source || 'manual',
      numista_id: d.numista_id || undefined,
      numista_issue_id: d.numista_issue_id || undefined,
      numista_url: tx(d.numista_url) || undefined,
      mintage: d.mintage ?? undefined,
      cover: d.cover_path ? `[[${d.cover_path}]]` : tx(d.cover) || undefined,
      cover_url: tx(d.cover_url) || undefined,
      reference_year: tx(d.reference_year) || undefined,
      cover_locked: isTrue(d.cover_locked) || isTrue(d.own_cover),
      own_cover: isTrue(d.own_cover),
      official_issue: isTrue(d.official_issue),
      object_type_id: tx(d.object_type_id) || undefined,
      object_type_name: tx(d.object_type_name) || undefined,
      photo_author: tx(d.photo_author) || undefined,
      photo_author_url: tx(d.photo_author_url) || undefined,
      photo_license: tx(d.photo_license) || undefined,
      photo_license_url: tx(d.photo_license_url) || undefined,
      numismatic_value_currency: tx(d.numismatic_value_currency) || undefined,
      numismatic_values: Array.isArray(d.numismatic_values) ? d.numismatic_values : undefined,
      numismatic_value_unc: d.numismatic_value_unc ?? undefined,
    };
    const managedKeys = Object.keys(fm);
    Object.keys(fm).forEach(
      (k) => (fm[k] === undefined || fm[k] === null || fm[k] === '') && delete fm[k]
    );
    if (file instanceof TFile) {
      /*
       * Update only the fields managed by the plugin. Other frontmatter keys
       * (tags, custom fields) and the note body written by the user are kept.
       */
      let previousCover = '';
      await this.app.fileManager.processFrontMatter(file, (current) => {
        previousCover = tx(current.cover);
        for (const key of managedKeys) {
          if (Object.prototype.hasOwnProperty.call(fm, key)) current[key] = fm[key];
          else delete current[key];
        }
      });
      await this.app.vault.process(file, (content) =>
        this.updateCoinBody(content, fm.title, previousCover, tx(fm.cover))
      );
      if (options.rename) await this.renameCoinFile(file, fm);
      return file;
    }
    const body = `---\n${stringifyYaml(fm).trimEnd()}\n---\n\n# ${fm.title}\n\n${fm.cover ? `!${fm.cover}\n` : ''}`;
    return this.app.vault.create(await this.uniquePath(this.notePath(fm)), body);
  },

  updateCoinBody(content, title, oldCover, newCover) {
    const head = content.match(/^---\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(\r?\n|$)/)?.[0] || '';
    let body = content.slice(head.length);
    const heading = /^#[^\S\r\n]+.*$/m,
      embed = newCover ? `!${newCover}` : '';
    if (heading.test(body)) body = body.replace(heading, () => `# ${title}`);
    else body = `\n# ${title}\n${body ? `\n${body}` : ''}`;
    if (oldCover && body.includes(`!${oldCover}`)) {
      body = body.replace(`!${oldCover}`, () => embed);
    } else if (embed && !body.includes(embed)) {
      body = body.replace(heading, (line) => `${line}\n\n${embed}`);
    }
    return head + body;
  },

  async renameCoinFile(file, fm) {
    const desired = this.notePath(fm),
      oldPath = file.path,
      withoutCounter = oldPath.replace(/ \d+\.md$/, '.md');
    if (oldPath === desired || withoutCounter === desired) return file;
    await this.ensureFolder(desired.slice(0, desired.lastIndexOf('/')));
    await this.app.fileManager.renameFile(file, await this.uniquePath(desired));
    if (this.selectedCoinPaths?.delete(oldPath)) this.selectedCoinPaths.add(file.path);
    return file;
  },

  getReferenceYearSuggestions(form, currentFile = null) {
    const country = countryName(form?.country).toLowerCase();
    const title = tx(form?.title).toLowerCase().replace(/\s+/g, ' ');
    const type = tx(form?.coin_type).toLowerCase();
    if (!country || !title || !type) return [];
    const years = new Set();
    for (const row of this.getRows()) {
      if (currentFile instanceof TFile && row.file.path === currentFile.path) continue;
      if (!row.cover_locked) continue;
      if (!this.coverSrc(row)) continue;
      if (countryName(row.country).toLowerCase() !== country) continue;
      if (tx(row.title).toLowerCase().replace(/\s+/g, ' ') !== title) continue;
      if (tx(row.coin_type).toLowerCase() !== type) continue;
      if (tx(row.year)) years.add(String(row.year));
    }
    return [...years].sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
  },

  getRows() {
    return this.filesInFolder(this.coins(), 'md')
      .map((file) => {
        const m = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
        return {
          file,
          country: countryName(m.country),
          year: tx(m.year),
          title: normalizeCoinTitle(tx(m.title) || file.basename),
          coin_type: tx(m.coin_type) || 'commemorative',
          mint_mark: tx(m.mint_mark),
          owned: isTrue(m.owned),
          quantity: Number(m.quantity) || 0,
          acquisition_date: tx(m.acquisition_date),
          acquisition_price: m.acquisition_price,
          acquisition_currency: tx(m.acquisition_currency),
          condition: tx(m.condition),
          notes: tx(m.notes),
          source: tx(m.source),
          numista_id: tx(m.numista_id),
          numista_issue_id: tx(m.numista_issue_id),
          numista_url: tx(m.numista_url),
          mintage: m.mintage,
          cover: tx(m.cover),
          cover_url: tx(m.cover_url),
          reference_year: tx(m.reference_year),
          cover_locked: isTrue(m.cover_locked),
          own_cover: isTrue(m.own_cover),
          official_issue: isTrue(m.official_issue),
          object_type_id: tx(m.object_type_id),
          object_type_name: tx(m.object_type_name),
          photo_author: tx(m.photo_author),
          photo_author_url: tx(m.photo_author_url),
          photo_license: tx(m.photo_license),
          photo_license_url: tx(m.photo_license_url),
          numismatic_value_currency: tx(m.numismatic_value_currency),
          numismatic_values: Array.isArray(m.numismatic_values) ? m.numismatic_values : [],
          numismatic_value_unc: m.numismatic_value_unc,
        };
      })
      .filter((r) => r.country && r.year);
  },

  localPath(r) {
    const p = tx(r?.cover).replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
    if (!p) return '';
    // pełna ścieżka
    if (p.includes('/')) {
      if (this.app.vault.getAbstractFileByPath(p)) return p;
      // Legacy links may use a different letter case of the covers folder.
      const covers = this.covers();
      if (p.toLowerCase().startsWith(`${covers.toLowerCase()}/`))
        return `${covers}${p.slice(covers.length)}`;
      return p;
    }
    // sam plik
    return this.join(this.covers(), p);
  },

  coverSrc(r) {
    const p = this.localPath(r);
    if (!p || !this.isSupportedImage(p)) {
      return '';
    }
    const file = this.app.vault.getAbstractFileByPath(p);
    return file instanceof TFile ? this.app.vault.getResourcePath(file) : '';
  },

  filterRowsByState(rows, state) {
    let list = rows.filter(
      (r) =>
        !state.mode ||
        state.mode === 'all' ||
        state.mode === r.coin_type ||
        (state.mode === 'owned' && r.owned) ||
        (state.mode === 'missing' && !r.owned)
    );
    if (state.country) list = list.filter((r) => r.country === state.country);
    if (state.year) list = list.filter((r) => r.year === state.year);
    const q = (state.searchText || '').toLowerCase();
    if (q)
      list = list.filter((r) =>
        [r.country, r.title, r.year, r.mint_mark].join(' ').toLowerCase().includes(q)
      );
    return list;
  },

  formatNumismaticValue(row) {
    const values = Array.isArray(row?.numismatic_values) ? row.numismatic_values : [],
      currency = tx(row?.numismatic_value_currency) || 'EUR';
    if (!values.length) return '';
    return values
      .map((item) => `${String(item.grade || '').toUpperCase()}: ${item.price} ${currency}`)
      .join(' · ');
  },

  getCurrentCoinFile() {
    if (this.currentCoinFile instanceof TFile) return this.currentCoinFile;
    const active = this.app.workspace.getActiveFile();
    const prefix = `${this.coins().replace(/\/$/, '')}/`;
    return active instanceof TFile && active.path.startsWith(prefix) ? active : null;
  },

  async waitForFreshRow(file, attempts = 8) {
    for (let i = 0; i < attempts; i++) {
      const row = this.getRows().find((r) => r.file.path === file.path);
      if (row) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        const again = this.getRows().find((r) => r.file.path === file.path);
        if (again) return again;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.getRows().find((r) => r.file.path === file.path) || null;
  },

  async readCoinRowFresh(file) {
    const content = await this.app.vault.read(file),
      match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let fm = {};
    if (match) {
      try {
        fm = parseYaml(match[1]) || {};
      } catch {
        fm = {};
      }
    }
    const cached = this.getRows().find((row) => row.file.path === file.path) || { file };
    return {
      ...cached,
      file,
      country: countryName(fm.country ?? cached.country),
      year: tx(fm.year ?? cached.year),
      title: normalizeCoinTitle(tx(fm.title ?? cached.title) || file.basename),
      coin_type: tx(fm.coin_type ?? cached.coin_type) || 'commemorative',
      mint_mark: tx(fm.mint_mark ?? cached.mint_mark),
      owned: isTrue(fm.owned ?? cached.owned),
      quantity: Number(fm.quantity ?? cached.quantity) || 0,
      acquisition_date: tx(fm.acquisition_date ?? cached.acquisition_date),
      acquisition_price: fm.acquisition_price ?? cached.acquisition_price,
      acquisition_currency: tx(fm.acquisition_currency ?? cached.acquisition_currency),
      condition: tx(fm.condition ?? cached.condition),
      notes: tx(fm.notes ?? cached.notes),
      cover: tx(fm.cover ?? cached.cover),
      cover_url: tx(fm.cover_url ?? cached.cover_url),
      reference_year: tx(fm.reference_year ?? cached.reference_year),
      cover_locked: isTrue(fm.cover_locked ?? cached.cover_locked),
      own_cover: isTrue(fm.own_cover ?? cached.own_cover),
      photo_author: tx(fm.photo_author ?? cached.photo_author),
      photo_license: tx(fm.photo_license ?? cached.photo_license),
      numismatic_value_currency: tx(
        fm.numismatic_value_currency ?? cached.numismatic_value_currency
      ),
      numismatic_values: Array.isArray(fm.numismatic_values)
        ? fm.numismatic_values
        : cached.numismatic_values || [],
      numismatic_value_unc: fm.numismatic_value_unc ?? cached.numismatic_value_unc,
    };
  },
};
