import { Notice, TFile, parseYaml, stringifyYaml } from 'obsidian';
import { tx, normalizeCoinTitle, coinIdentityKey } from '../utils.js';

export const maintenanceMethods = {
  async normalizeExistingTitles() {
    let updated = 0,
      unchanged = 0,
      errors = 0;
    const files = this.filesInFolder(this.coins(), 'md');
    for (const file of files) {
      try {
        const content = await this.app.vault.read(file),
          match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match) {
          unchanged++;
          continue;
        }
        const fm = parseYaml(match[1]) || {},
          rawTitle = tx(fm.title),
          normalized = normalizeCoinTitle(rawTitle);
        if (!rawTitle || rawTitle === normalized) {
          unchanged++;
          continue;
        }
        fm.title = normalized;
        let body = content.slice(match[0].length);
        body = body.replace(/^(\s*#\s+)2\s*Euros?\.?\b/im, `$1${normalized}`);
        const rewritten = `---\n${stringifyYaml(fm).trimEnd()}\n---${body}`;
        await this.app.vault.modify(file, rewritten);
        updated++;
      } catch (error) {
        errors++;
        console.error('Normalize coin title', file.path, error);
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    await this.refreshDashboards();
    this.refreshFilterViews();
    new Notice(this.t('notice.titlesNormalized', { updated, unchanged, errors }));
    return { updated, unchanged, errors };
  },

  async normalizeCountryFolders() {
    const mappings = [
      ['Germany, Federal Republic of', 'Germany'],
      ['Germany, Federal Republic', 'Germany'],
      ['Federal Republic of Germany', 'Germany'],
      ['Vatican City', 'Vatican'],
      ['Vatican City State', 'Vatican'],
      ['Vatican City, State of', 'Vatican'],
      ['Holy See (Vatican City State)', 'Vatican'],
    ];
    let moved = 0;
    for (const [from, to] of mappings)
      moved += await this.moveFolderContents(
        this.join(this.coins(), from),
        this.join(this.coins(), to)
      );
    return moved;
  },

  async initializeReferenceFields() {
    let updated = 0,
      unchanged = 0;
    for (const row of this.getRows()) {
      let changed = false;
      await this.app.fileManager.processFrontMatter(row.file, (fm) => {
        if (!Object.prototype.hasOwnProperty.call(fm, 'reference_year')) {
          fm.reference_year = '';
          changed = true;
        }
        if (!Object.prototype.hasOwnProperty.call(fm, 'cover_locked')) {
          fm.cover_locked = false;
          changed = true;
        }
      });
      if (changed) updated++;
      else unchanged++;
    }
    return { updated, unchanged };
  },

  removeUnofficialImports() {
    return this.runOperation(() => this.removeUnofficialImportsRun());
  },

  async removeUnofficialImportsRun() {
    if (!(await this.confirm(this.t('confirm.removeUnofficial'), { warning: true }))) return;
    const rows = this.getRows().filter((row) => row.source === 'numista');
    let removed = 0,
      protectedCount = 0,
      errors = 0;
    const notice = this.progressNotice(
      this.t('notice.verifyOfficial', { current: 0, total: rows.length })
    );
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      notice.setMessage(this.t('notice.verifyOfficial', { current: i + 1, total: rows.length }));
      try {
        if (row.owned || row.cover_locked || row.own_cover) {
          protectedCount++;
          continue;
        }
        let official = row.official_issue;
        if (!official && row.numista_id) {
          const details = await this.getTypeDetails(row.numista_id);
          official = this.isOfficialTwoEuroType(details);
        }
        if (!official) {
          await this.app.fileManager.trashFile(row.file);
          removed++;
        }
      } catch (error) {
        if (this.isNumistaAuthError(error) || error?.aborted) throw error;
        errors++;
        console.error('Remove unofficial import', row.file?.path, error);
      }
    }
    await this.refreshDashboards();
    this.refreshFilterViews();
    notice.setMessage(
      this.t('notice.removeUnofficial', { removed, protected: protectedCount, errors })
    );
    window.setTimeout(() => notice.hide(), 8000);
  },

  async dedupe() {
    const g = new Map();
    for (const r of this.getRows()) {
      const k = coinIdentityKey(r);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(r);
    }
    let n = 0;
    for (const a of g.values()) {
      if (a.length < 2) continue;
      /*
       * Keep the owned coin, then one with a custom/locked cover, then one
       * with a cover at all. Numista ids from removed copies are carried over
       * so later synchronizations recognise the kept coin.
       */
      const keep =
        a.find((x) => x.owned) ||
        a.find((x) => x.own_cover || x.cover_locked) ||
        a.find((x) => this.coverSrc(x)) ||
        a[0];
      const donor = a.find((x) => x !== keep && x.numista_id);
      if (!keep.numista_id && donor && keep.file instanceof TFile) {
        await this.app.fileManager.processFrontMatter(keep.file, (fm) => {
          fm.numista_id = donor.numista_id;
          if (donor.numista_issue_id) fm.numista_issue_id = donor.numista_issue_id;
          if (donor.numista_url) fm.numista_url = donor.numista_url;
        });
      }
      for (const r of a)
        if (r !== keep && !r.owned && r.file instanceof TFile) {
          await this.app.fileManager.trashFile(r.file);
          n++;
        }
    }
    await this.refreshDashboards();
    return n;
  },

  async migrateCoverLinks() {
    let updated = 0;
    for (const row of this.getRows()) {
      const cover = tx(row.cover);
      if (!cover) continue;
      const parsed = cover.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0];
      // tylko stare wpisy bez ścieżki
      if (!parsed.includes('/')) {
        const newPath = this.join(this.covers(), parsed);
        await this.upsert(
          {
            ...row,
            cover_path: newPath,
          },
          row.file
        );
        updated++;
      }
    }
    return updated;
  },

  async normalizeProtectedCoverNames() {
    const rows = this.getRows().filter((row) => row.cover_locked);
    let renamed = 0,
      skipped = 0,
      errors = 0;
    for (const row of rows) {
      try {
        const oldPath = this.localPath(row);
        const oldExt = (oldPath.split('.').pop() || '').toLowerCase();
        if (!oldPath || !['png', 'webp'].includes(oldExt)) {
          skipped++;
          continue;
        }
        const file = this.app.vault.getAbstractFileByPath(oldPath);
        if (!(file instanceof TFile)) {
          skipped++;
          continue;
        }
        const desired = await this.uniqueCoverPath(
          this.join(this.covers(), `${this.coverFileStem(row)}.${oldExt}`),
          oldPath
        );
        if (desired !== oldPath) await this.app.fileManager.renameFile(file, desired);
        await this.app.fileManager.processFrontMatter(row.file, (fm) => {
          fm.cover = `[[${desired}]]`;
          if (fm.own_cover === true) fm.cover_locked = true;
        });
        renamed++;
      } catch (error) {
        errors++;
        console.error('Normalize protected cover', row.file?.path, error);
      }
    }
    await this.refreshDashboards();
    new Notice(this.t('notice.coverNamesNormalized', { renamed, skipped, errors }));
    return { renamed, skipped, errors };
  },

  /*
   * Repair command: converts existing PNG covers in the covers folder to WebP
   * (max COVER_MAX_SIZE px), updates every coin that uses them and moves the
   * PNG files to the trash.
   */
  convertPngCoversToWebp() {
    return this.runOperation(() => this.convertPngCoversToWebpRun());
  },

  async convertPngCoversToWebpRun() {
    const rows = this.getRows(),
      prefix = `${this.covers()}/`,
      groups = new Map();
    for (const row of rows) {
      const coverPath = this.localPath(row);
      if (!coverPath.startsWith(prefix) || !coverPath.toLowerCase().endsWith('.png')) continue;
      const file = this.app.vault.getAbstractFileByPath(coverPath);
      if (!(file instanceof TFile)) continue;
      if (!groups.has(coverPath)) groups.set(coverPath, { file, rows: [] });
      groups.get(coverPath).rows.push(row);
    }
    if (!groups.size) {
      new Notice(this.t('notice.convertCoversNone'));
      return;
    }
    const mb = (bytes) => (bytes / 1e6).toFixed(1);
    const totalBefore = [...groups.values()].reduce((sum, g) => sum + (g.file.stat?.size || 0), 0);
    if (
      !(await this.confirm(
        this.t('confirm.convertCoversWebp', { count: groups.size, size: mb(totalBefore) })
      ))
    )
      return;
    let converted = 0,
      errors = 0,
      before = 0,
      after = 0,
      index = 0;
    const progress = this.progressNotice(
      this.t('notice.convertCoversProgress', { current: 0, total: groups.size })
    );
    for (const [oldPath, group] of groups) {
      this.throwIfAborted();
      index++;
      progress.setMessage(
        this.t('notice.convertCoversProgress', { current: index, total: groups.size })
      );
      try {
        const binary = await this.app.vault.readBinary(group.file),
          image = await this.loadImageFromArrayBuffer(binary),
          canvas = this.resizeImageToCanvas(image),
          { blob, ext } = await this.canvasToCoverBlob(canvas);
        if (ext !== 'webp') {
          progress.setMessage(this.t('error.webpUnsupported'));
          window.setTimeout(() => progress.hide(), 8000);
          return;
        }
        const newPath = await this.uniqueCoverPath(oldPath.replace(/\.png$/i, '.webp'));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await this.app.vault.adapter.writeBinary(newPath, bytes);
        for (const row of group.rows) {
          const oldLink = tx(row.cover);
          await this.app.fileManager.processFrontMatter(row.file, (fm) => {
            fm.cover = `[[${newPath}]]`;
          });
          await this.app.vault.process(row.file, (content) =>
            oldLink ? content.split(`!${oldLink}`).join(`![[${newPath}]]`) : content
          );
        }
        before += binary.byteLength;
        after += bytes.length;
        await this.app.fileManager.trashFile(group.file);
        converted++;
      } catch (error) {
        errors++;
        console.error('Convert cover to WebP', oldPath, error);
      }
    }
    progress.setMessage(
      this.t('notice.convertCoversDone', {
        converted,
        errors,
        before: mb(before),
        after: mb(after),
      })
    );
    window.setTimeout(() => progress.hide(), 10000);
    await this.refreshDashboards();
    return { converted, errors, before, after };
  },
};
