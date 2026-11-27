import { requestUrl } from 'obsidian';
import { DEFAULT_REFERENCE_ISSUERS } from '../constants.js';
import { tx, countryName, asError, parseJson } from '../utils.js';

/** @typedef {import('../types').NumistaType} NumistaType */

/*
 * Numista API client (request pacing, retries on HTTP 429, authentication
 * errors, issuer codes) and the rules that read Numista catalogue data:
 * pictures, photo credits and whether a type is an official 2 euro coin.
 */
/** @satisfies {ThisType<import('../types').TwoEuroPlugin>} */
export const numistaMethods = {
  /**
   * @param {number} [minIntervalMs]
   */
  async waitForRequestSlot(minIntervalMs = 1250) {
    const now = Date.now(),
      wait = Math.max(0, (this._lastRequestAt || 0) + minIntervalMs - now);
    if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
    this._lastRequestAt = Date.now();
  },

  /**
   * @param {import('obsidian').RequestUrlParam} options
   * @param {{ minIntervalMs?: number, maxAttempts?: number, label?: string }} [config]
   */
  async requestWithRetry(options, config = {}) {
    const minIntervalMs = config.minIntervalMs || 1250,
      maxAttempts = config.maxAttempts || 5,
      label = config.label || 'Numista';
    /** @type {unknown} */
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.throwIfAborted();
      await this.waitForRequestSlot(minIntervalMs);
      this.throwIfAborted();
      try {
        this.countNumistaRequest();
        return await requestUrl(options);
      } catch (error) {
        lastError = error;
        const err = asError(error),
          match = (err.message || '').match(/status\s+(\d+)/i),
          status = Number(err.status || err.response?.status || (match && match[1]) || 0);
        if (status !== 429 || attempt === maxAttempts) throw error;
        const delayMs =
          Math.min(60000, 5000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 1000);
        console.warn(`${label}: HTTP 429; retrying in ${delayMs} ms`);
        await new Promise((r) => window.setTimeout(r, delayMs));
      }
    }
    throw lastError;
  },

  /**
   * @param {unknown} error
   */
  isNumistaAuthError(error) {
    return Boolean(asError(error).numistaAuth);
  },

  /**
   * @param {string} path
   * @returns {Promise<unknown>}
   */
  async api(path) {
    let r;
    try {
      r = await this.requestWithRetry(
        {
          url: `https://api.numista.com/v3${path}`,
          headers: {
            'Numista-API-Key': this.getNumistaApiKey(),
            accept: 'application/json',
          },
        },
        { minIntervalMs: 1250, maxAttempts: 5, label: 'Numista API' }
      );
    } catch (error) {
      const err = asError(error),
        match = (err.message || '').match(/status\s+(\d+)/i),
        status = Number(err.status || (match && match[1]) || 0);
      if (status === 401 || status === 403) {
        /** @type {import('../types').PluginError} */
        const authError = new Error(this.t('error.numistaAuth', { status }));
        authError.status = status;
        authError.numistaAuth = true;
        throw authError;
      }
      throw error;
    }
    if (r.status >= 400) throw new Error(`Numista HTTP ${r.status}`);
    /** @type {unknown} */
    const json = r.json;
    return json || parseJson(r.text || '{}');
  },

  /**
   * @param {unknown} country
   */
  async getNumistaIssuerCode(country) {
    const selected = countryName(country);
    if (!selected) return '';
    try {
      if (!this._numistaIssuers) {
        const result =
          /** @type {{ issuers?: import('../types').NumistaIssuer[] } | import('../types').NumistaIssuer[] | null} */ (
            await this.api('/issuers?lang=en')
          );
        this._numistaIssuers = Array.isArray(result)
          ? result
          : Array.isArray(result?.issuers)
            ? result.issuers
            : [];
      }
      const match = this._numistaIssuers.find(
        (issuer) => tx(issuer?.code) && this.matchesNumistaSyncCountry(issuer?.name, selected)
      );
      return match ? tx(match.code) : '';
    } catch (error) {
      if (this.isNumistaAuthError(error)) throw error;
      console.warn('Numista issuers unavailable', error);
      return '';
    }
  },

  /**
   * @param {unknown} numistaCountry
   * @param {unknown} selectedCountry
   */
  matchesNumistaSyncCountry(numistaCountry, selectedCountry) {
    if (!selectedCountry) return true;
    const source = countryName(numistaCountry);
    const selected = countryName(selectedCountry);
    return source.localeCompare(selected, undefined, { sensitivity: 'base' }) === 0;
  },

  /**
   * @param {unknown} v
   * @returns {string}
   */
  extractImage(v) {
    if (!v) return '';
    if (typeof v === 'string') return /^https?:/i.test(v) ? v : '';
    if (Array.isArray(v)) {
      for (const x of v) {
        const u = this.extractImage(x);
        if (u) return u;
      }
    } else if (typeof v === 'object') {
      for (const k of ['picture', 'image', 'url', 'uri', 'full', 'large', 'thumbnail', 'preview']) {
        const u = this.extractImage(/** @type {Record<string, unknown>} */ (v)[k]);
        if (u) return u;
      }
    }
    return '';
  },

  /**
   * @param {NumistaType | null | undefined} d
   * @returns {string}
   */
  pickImage(d) {
    return (
      this.extractImage(d && d.obverse) ||
      this.extractImage(d && d.pictures) ||
      this.extractImage(d && d.images)
    );
  },

  /**
   * @param {NumistaType | null | undefined} details
   */
  photoMetadata(details) {
    const side = details?.obverse || {};
    return {
      photo_author: tx(side.picture_copyright),
      photo_author_url: tx(side.picture_copyright_url),
      photo_license: tx(side.picture_license_name),
      photo_license_url: tx(side.picture_license_url),
    };
  },

  /**
   * @param {NumistaType | null | undefined} d
   */
  isTwoEuro(d) {
    const numericValue = Number(d?.value?.numeric_value);

    const currencyName = tx(d?.value?.currency?.name).trim().toLowerCase();

    const currencyFullName = tx(d?.value?.currency?.full_name).trim().toLowerCase();

    const isEuroCurrency =
      currencyName === 'euro' ||
      currencyFullName === 'euro' ||
      currencyFullName.startsWith('euro (');

    return numericValue === 2 && isEuroCurrency;
  },

  officialEuroIssuers() {
    const builtIn =
      this.settings.referenceDataInitialized && this.settings.referenceIssuers?.length
        ? this.settings.referenceIssuers
        : DEFAULT_REFERENCE_ISSUERS;
    const additional = Array.isArray(this.settings.additionalIssuers)
      ? this.settings.additionalIssuers
      : [];
    return new Set([...builtIn, ...additional].map(countryName).filter(Boolean));
  },

  /**
   * @param {NumistaType | null | undefined} details
   */
  isOfficialTwoEuroType(details) {
    if (!this.isTwoEuro(details)) return false;
    const issuer = countryName(details?.issuer?.name),
      objectId = Number(details?.object_type?.id || 0),
      objectName = tx(details?.object_type?.name).toLowerCase();
    const officialObject =
      objectId === 1 ||
      objectId === 2 ||
      objectId === 3 ||
      objectName === 'standard circulation coins' ||
      objectName === 'circulating commemorative coins' ||
      objectName === 'non-circulating coins';
    if (!officialObject || !this.officialEuroIssuers().has(issuer)) return false;
    const haystack = [details?.title, details?.object_type?.name, details?.issuer?.name]
      .map(tx)
      .join(' ')
      .toLowerCase();
    return !/(medal|medallion|token|jeton|pattern|trial|probe|proba|essai|fantasy|fantaisie|private issue|souvenir|replica|copy)/i.test(
      haystack
    );
  },
};
