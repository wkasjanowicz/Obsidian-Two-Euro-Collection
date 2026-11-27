import { Notice } from 'obsidian';
import { tx, asError, errorText } from '../utils.js';

/*
 * Numismatic values (prices by grade) of coins from the Numista price API.
 */
/** @satisfies {ThisType<import('../types').TwoEuroPlugin>} */
export const pricesMethods = {
  /**
   * @param {unknown} typeId
   * @param {unknown} issueId
   */
  async issueNumismaticValues(typeId, issueId) {
    if (!typeId || !issueId) return { currency: 'EUR', values: [], unc: null };
    try {
      const result = /** @type {import('../types').NumistaPrices | null} */ (
          await this.api(
            `/types/${encodeURIComponent(tx(typeId))}/issues/${encodeURIComponent(tx(issueId))}/prices?currency=EUR&lang=en`
          )
        ),
        prices = Array.isArray(result?.prices) ? result.prices : [],
        values = prices
          .filter((item) => item && item.price != null)
          .map((item) => ({ grade: tx(item.grade), price: Number(item.price) }))
          .filter((item) => Number.isFinite(item.price));
      const unc = values.find((item) => item.grade.toLowerCase() === 'unc')?.price ?? null;
      return { currency: tx(result?.currency) || 'EUR', values, unc };
    } catch (error) {
      if (this.isNumistaAuthError(error) || asError(error).aborted) throw error;
      console.warn('Numista prices unavailable', typeId, issueId, error);
      return null;
    }
  },

  updateNumistaPrices() {
    return this.runOperation(() => this.updateNumistaPricesRun());
  },

  async updateNumistaPricesRun() {
    if (!this.getNumistaApiKey()) {
      new Notice(this.t('notice.apiKeyMissing'));
      return;
    }
    const rows = this.filterRowsByState(this.getRows(), this.getDashboardState()).filter(
      (row) => row.numista_id && row.numista_issue_id
    );
    if (!rows.length) {
      new Notice(this.t('notice.pricesNone'));
      return;
    }
    if (!(await this.confirm(this.t('confirm.updatePrices', { count: rows.length })))) return;
    let updated = 0,
      unchanged = 0,
      errors = 0;
    const progress = this.progressNotice(
      this.t('notice.pricesProgress', { current: 0, total: rows.length, updated, errors })
    );
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        progress.setMessage(
          this.t('notice.pricesProgress', { current: i + 1, total: rows.length, updated, errors })
        );
        const valuation = await this.issueNumismaticValues(row.numista_id, row.numista_issue_id);
        if (!valuation) {
          errors++;
          continue;
        }
        const before = JSON.stringify([
          row.numismatic_value_currency || 'EUR',
          row.numismatic_values || [],
          row.numismatic_value_unc ?? null,
        ]);
        const after = JSON.stringify([valuation.currency, valuation.values, valuation.unc]);
        if (before === after || !valuation.values.length) {
          unchanged++;
          continue;
        }
        await this.app.fileManager.processFrontMatter(
          row.file,
          (/** @type {Record<string, unknown>} */ fm) => {
            fm.numismatic_value_currency = valuation.currency;
            fm.numismatic_values = valuation.values;
            if (valuation.unc == null) delete fm.numismatic_value_unc;
            else fm.numismatic_value_unc = valuation.unc;
          }
        );
        updated++;
      }
      progress.setMessage(this.t('notice.pricesDone', { updated, unchanged, errors }));
      await this.recordValueSnapshot();
    } catch (error) {
      console.error('Numista prices', error);
      progress.setMessage(errorText(error));
    }
    window.setTimeout(() => progress.hide(), 8000);
    return { updated, unchanged, errors };
  },
};
