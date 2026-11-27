import { Notice } from 'obsidian';
import { tx, countryName } from '../utils.js';

/** @typedef {import('../types').NumistaType} NumistaType */
/** @typedef {import('../types').NewIssuesResult} NewIssuesResult */

/*
 * Periodic check for 2 euro coins on Numista that the collection does not
 * have yet: coins of the current year (and, from October, of the next year,
 * which Numista lists as soon as they are announced). It is cheap: one search
 * request per coin category and year, no type details. When something is
 * found, a notice offers to synchronize that year.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const START_DELAY_MS = 60 * 1000;
const OBJECT_TYPES = ['1', '2', '3'];
const PAGE_SIZE = 50;
const MAX_PAGES = 4;

/**
 * Whether a search result covers a year (types without years are kept).
 * @param {NumistaType} basic
 * @param {number} year
 */
const coversYear = (basic, year) => {
  const min = Number(basic.min_year),
    max = Number(basic.max_year);
  if (Number.isInteger(min) && min > year) return false;
  if (Number.isInteger(max) && max < year) return false;
  return true;
};

/** @satisfies {ThisType<import('../types').TwoEuroPlugin>} */
export const newIssuesMethods = {
  /**
   * Years to check: the current one and, from October, the next one.
   * @param {Date} [now]
   * @returns {number[]}
   */
  newIssueYears(now = new Date()) {
    const year = now.getFullYear();
    return now.getMonth() >= 9 ? [year, year + 1] : [year];
  },

  /** Runs the check shortly after start-up when it is due. */
  scheduleNewIssuesCheck() {
    this.app.workspace.onLayoutReady(() => {
      this.registerInterval(
        window.setTimeout(() => void this.checkNewIssuesIfDue(), START_DELAY_MS)
      );
    });
  },

  /**
   * @param {number} [now]
   * @returns {boolean}
   */
  isNewIssuesCheckDue(now = Date.now()) {
    const days = Number(this.settings.newIssuesCheckDays);
    if (!Number.isFinite(days) || days <= 0) return false;
    const last = Date.parse(tx(this.settings.newIssuesLastCheck));
    return !Number.isFinite(last) || now - last >= days * DAY_MS;
  },

  /**
   * Background check: silent unless something new is found.
   * @returns {Promise<NewIssuesResult | null>}
   */
  async checkNewIssuesIfDue() {
    if (!this.getNumistaApiKey() || this.isOperationRunning() || !this.isNewIssuesCheckDue())
      return null;
    try {
      return await this.checkNewIssues({ quiet: true });
    } catch (error) {
      console.warn('2 Euro Collection: new coins check failed', error);
      return null;
    }
  },

  /** Command: check now and always report the result. */
  checkNewIssuesNow() {
    return this.runOperation(() => this.checkNewIssues({ quiet: false }));
  },

  /**
   * Searches Numista for 2 euro coins of the checked years that are not in
   * the collection (by Numista id and year) and come from a euro country.
   * @param {{ quiet?: boolean }} [options]
   * @returns {Promise<NewIssuesResult | null>}
   */
  async checkNewIssues({ quiet = false } = {}) {
    if (!this.getNumistaApiKey()) {
      if (!quiet) new Notice(this.t('notice.apiKeyMissing'));
      return null;
    }
    const known = new Set(
      this.getRows()
        .filter((row) => row.numista_id)
        .map((row) => `${row.numista_id}|${row.year}`)
    );
    const issuers = this.officialEuroIssuers();
    /** @type {NewIssuesResult} */
    const result = { total: 0, byYear: [] };
    for (const year of this.newIssueYears()) {
      /** @type {Map<string, string>} */
      const found = new Map();
      for (const objectType of OBJECT_TYPES) {
        for (const basic of await this.searchTwoEuroTypes(objectType, year)) {
          const id = tx(basic.id);
          if (!id || found.has(id) || known.has(`${id}|${year}`)) continue;
          if (!coversYear(basic, year)) continue;
          const issuer = countryName(basic.issuer?.name);
          if (issuer && !issuers.has(issuer)) continue;
          found.set(id, tx(basic.title));
        }
      }
      if (found.size) {
        result.byYear.push({ year: String(year), count: found.size, titles: [...found.values()] });
        result.total += found.size;
      }
    }
    this.settings.newIssuesLastCheck = new Date().toISOString();
    await this.saveSettings();
    if (result.total) this.showNewIssuesNotice(result);
    else if (!quiet) new Notice(this.t('notice.newIssuesNone'));
    return result;
  },

  /**
   * 2 euro types of one coin category issued in a year. The year is filtered
   * on the server when Numista accepts it, otherwise locally.
   * @param {string} objectType
   * @param {number} year
   * @returns {Promise<NumistaType[]>}
   */
  async searchTwoEuroTypes(objectType, year) {
    /** @type {NumistaType[]} */
    const types = [];
    let serverYear = true;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const q = new URLSearchParams({
        q: '2 Euros',
        object_type: objectType,
        page: String(page),
        count: String(PAGE_SIZE),
        lang: 'en',
      });
      if (serverYear) q.set('year', String(year));
      /** @type {import('../types').NumistaTypesPage} */
      let listing;
      try {
        listing = /** @type {import('../types').NumistaTypesPage} */ (
          await this.api(`/types?${q}`)
        );
      } catch (error) {
        if (this.isNumistaAuthError(error) || page !== 1 || !serverYear) throw error;
        serverYear = false;
        q.delete('year');
        listing = /** @type {import('../types').NumistaTypesPage} */ (
          await this.api(`/types?${q}`)
        );
      }
      const pageTypes = listing.types || [];
      types.push(...pageTypes.filter((basic) => coversYear(basic, year)));
      if (pageTypes.length < PAGE_SIZE) break;
    }
    return types;
  },

  /**
   * Persistent notice with the coins found and a button per year that
   * synchronizes that year.
   * @param {NewIssuesResult} result
   */
  showNewIssuesNotice(result) {
    const notice = new Notice(
      createFragment((fragment) => {
        fragment.createDiv({ text: this.t('notice.newIssuesFound', { count: result.total }) });
        for (const entry of result.byYear) {
          const preview = entry.titles.slice(0, 3).join(', ');
          fragment.createDiv({
            cls: 'twoeuro-new-issues-year',
            text: `${entry.year}: ${entry.count}${preview ? ` – ${preview}` : ''}${
              entry.titles.length > 3 ? '…' : ''
            }`,
          });
          const button = fragment.createEl('button', {
            cls: 'mod-cta twoeuro-new-issues-sync',
            text: this.t('notice.newIssuesSync', { year: entry.year }),
          });
          button.onclick = () => {
            notice.hide();
            void this.syncNumista({ year: entry.year });
          };
        }
      }),
      0
    );
    return notice;
  },
};
