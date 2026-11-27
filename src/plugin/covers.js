import { Notice } from 'obsidian';
import { tx, clean, asError } from '../utils.js';

/** @typedef {import('../types').CoinRow} CoinRow */

/*
 * Downloading cover pictures from Numista: for one coin, or for every coin
 * that has no cover yet.
 */
/** @satisfies {ThisType<import('../types').TwoEuroPlugin>} */
export const coversMethods = {
  /**
   * @param {string} url
   * @param {unknown} id
   * @param {unknown} issue
   */
  async downloadCover(url, id, issue) {
    if (!/^https?:/i.test(url)) return '';
    await this.ensureFolder(this.covers());
    const headers = { accept: 'image/*,*/*' };
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === 'numista.com' || host.endsWith('.numista.com'))
        headers['Numista-API-Key'] = this.getNumistaApiKey();
    } catch {
      return '';
    }
    const r = await this.requestWithRetry(
      {
        url,
        headers,
      },
      { minIntervalMs: 1800, maxAttempts: 5, label: 'Numista cover' }
    );
    if (r.status >= 400) throw new Error(`Cover HTTP ${r.status}`);
    const ct = tx(r.headers?.['content-type'] || r.headers?.['Content-Type']).toLowerCase(),
      ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg',
      p = this.join(this.covers(), `numista-${clean(id)}-${clean(issue)}.${ext}`);
    await this.app.vault.adapter.writeBinary(p, r.arrayBuffer);
    return p;
  },

  backfillCovers() {
    return this.runOperation(() => this.backfillCoversRun());
  },

  async backfillCoversRun() {
    if (!this.getNumistaApiKey()) {
      new Notice(this.t('notice.apiKeyMissing'));
      return;
    }
    const candidates = this.getRows().filter(
        (r) => r.source === 'numista' && !r.cover_locked && !this.coverSrc(r)
      ),
      progress = this.progressNotice(
        this.t('notice.coversProgress', {
          current: 0,
          total: candidates.length,
          downloaded: 0,
          errors: 0,
        })
      );
    let downloaded = 0,
      skipped = 0,
      errors = 0,
      index = 0;
    for (const r of candidates) {
      index++;
      progress.setMessage(
        this.t('notice.coversProgress', {
          current: index,
          total: candidates.length,
          downloaded,
          errors,
        })
      );
      try {
        const d = await this.getTypeDetails(r.numista_id);
        const url = this.pickImage(d) || r.cover_url;
        if (!url) {
          skipped++;
          continue;
        }
        const path = await this.downloadCover(url, r.numista_id, r.numista_issue_id);
        await this.upsert({ ...r, cover_path: path, cover_url: url, cover_locked: false }, r.file);
        downloaded++;
      } catch (error) {
        if (this.isNumistaAuthError(error) || asError(error).aborted) throw error;
        errors++;
        console.error('Cover download', r.file?.path, error);
      }
    }
    progress.setMessage(this.t('notice.coversDone', { downloaded, skipped, errors }));
    window.setTimeout(() => progress.hide(), 8000);
    return { downloaded, skipped, errors };
  },

  /**
   * @param {CoinRow} row
   */
  async downloadNumistaCoverForCoin(row) {
    if (!row.numista_id) throw new Error(this.t('error.noNumistaId'));
    const details = await this.getTypeDetails(row.numista_id, { fresh: true }),
      url = this.pickImage(details);
    if (!url) throw new Error(this.t('error.noNumistaCover'));
    const path = await this.downloadCover(url, row.numista_id, row.numista_issue_id || row.year);
    await this.app.fileManager.processFrontMatter(
      row.file,
      (/** @type {Record<string, unknown>} */ fm) => {
        fm.cover = `[[${path}]]`;
        fm.cover_url = url;
        fm.cover_locked = false;
        fm.own_cover = false;
      }
    );
  },
};
