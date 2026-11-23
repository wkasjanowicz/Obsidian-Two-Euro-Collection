import { ConfirmModal } from '../ui/ConfirmModal.js';
import { DEFAULT_REFERENCE_ISSUERS, DEFAULTS } from '../constants.js';
import { tx, countryName } from '../utils.js';

export const settingsMethods = {
  async loadSettings() {
    const saved = (await this.loadData()) || {};

    this.settings = {
      ...DEFAULTS,
      ...saved,

      referenceIssuers: Array.isArray(saved.referenceIssuers) ? saved.referenceIssuers : [],

      additionalIssuers: Array.isArray(saved.additionalIssuers) ? saved.additionalIssuers : [],

      additionalYears: Array.isArray(saved.additionalYears) ? saved.additionalYears : [],
    };
  },

  /*
   * Numista API key: from Obsidian's secret storage (1.11.4+) when the user
   * picked a secret, otherwise from the plugin settings (older Obsidian).
   */
  getNumistaApiKey() {
    const id = tx(this.settings.numistaSecretId);
    if (id && this.app.secretStorage?.getSecret) return tx(this.app.secretStorage.getSecret(id));
    return tx(this.settings.numistaApiKey);
  },

  /* Moves a key stored in plain settings into Obsidian's secret storage. */
  async migrateApiKeyToSecretStorage() {
    const key = tx(this.settings.numistaApiKey);
    const storage = this.app.secretStorage;
    if (!key || !storage?.setSecret || tx(this.settings.numistaSecretId)) return false;
    const id = 'numista-api-key';
    storage.setSecret(id, key);
    this.settings.numistaSecretId = id;
    this.settings.numistaApiKey = '';
    await this.saveSettings();
    return true;
  },

  /* Asks the user to confirm an action in an Obsidian dialog. */
  confirm(message, { warning = false, confirmText = '' } = {}) {
    return ConfirmModal.ask(this.app, {
      message,
      warning,
      confirmText: confirmText || this.t('action.confirm'),
      cancelText: this.t('action.cancel'),
    });
  },
  /* Saves settings shortly after the last change (used for frequent UI state changes). */
  scheduleSettingsSave(delayMs = 1000) {
    if (this._settingsSaveTimer) window.clearTimeout(this._settingsSaveTimer);
    this._settingsSaveTimer = window.setTimeout(() => {
      this._settingsSaveTimer = null;
      this.saveSettings();
    }, delayMs);
  },
  async saveSettings() {
    await this.saveData(this.settings);
  },

  async initializeReferenceData() {
    const existingIssuers = Array.isArray(this.settings.referenceIssuers)
      ? this.settings.referenceIssuers
      : [];

    this.settings.referenceIssuers = [
      ...new Set([...DEFAULT_REFERENCE_ISSUERS, ...existingIssuers.map(countryName)]),
    ].sort((a, b) => a.localeCompare(b, this.getLanguage()));

    this.settings.referenceDataInitialized = true;

    if (!Number(this.settings.referenceYearFrom)) {
      this.settings.referenceYearFrom = 1999;
    }

    if (!Number.isFinite(Number(this.settings.futureYears))) {
      this.settings.futureYears = 1;
    }

    if (!Array.isArray(this.settings.additionalIssuers)) {
      this.settings.additionalIssuers = [];
    }

    if (!Array.isArray(this.settings.additionalYears)) {
      this.settings.additionalYears = [];
    }

    await this.saveSettings();
    this.refreshFilterViews();

    return {
      issuers: this.settings.referenceIssuers.length,
      years: this.getReferenceYears().length,
    };
  },

  getReferenceIssuers() {
    const rows = this.getRows();

    const builtIn = this.settings.referenceDataInitialized
      ? this.settings.referenceIssuers
      : DEFAULT_REFERENCE_ISSUERS;

    const additional = Array.isArray(this.settings.additionalIssuers)
      ? this.settings.additionalIssuers
      : [];

    const fromCollection = rows.map((row) => countryName(row.country)).filter(Boolean);

    return [
      ...new Set(
        [...builtIn, ...additional, ...fromCollection].map(countryName).map(tx).filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, this.getLanguage()));
  },

  getReferenceYears() {
    const firstYear = Math.max(1999, Number(this.settings.referenceYearFrom) || 1999);

    const futureRaw = Number(this.settings.futureYears);
    const futureYears = Math.max(0, Math.min(10, Number.isFinite(futureRaw) ? futureRaw : 1));

    const lastYear = new Date().getFullYear() + futureYears;
    const years = new Set();

    for (let year = firstYear; year <= lastYear; year++) {
      years.add(String(year));
    }

    const additional = Array.isArray(this.settings.additionalYears)
      ? this.settings.additionalYears
      : [];

    for (const year of additional) {
      const normalized = Number(year);

      if (Number.isInteger(normalized) && normalized >= 1999 && normalized <= 2200) {
        years.add(String(normalized));
      }
    }

    for (const row of this.getRows()) {
      const normalized = Number(row.year);

      if (Number.isInteger(normalized)) {
        years.add(String(normalized));
      }
    }

    return [...years].sort((a, b) => Number(b) - Number(a));
  },

  async addReferenceIssuer(value) {
    const issuer = countryName(value);

    if (!issuer) {
      return false;
    }

    const current = Array.isArray(this.settings.additionalIssuers)
      ? this.settings.additionalIssuers
      : [];

    const alreadyExists = this.getReferenceIssuers().some(
      (item) =>
        countryName(item).localeCompare(issuer, undefined, {
          sensitivity: 'base',
        }) === 0
    );

    if (alreadyExists) {
      return false;
    }

    this.settings.additionalIssuers = [...current, issuer].sort((a, b) =>
      a.localeCompare(b, this.getLanguage())
    );

    await this.saveSettings();
    this.refreshFilterViews();

    return true;
  },

  async removeReferenceIssuer(value) {
    const issuer = countryName(value);

    this.settings.additionalIssuers = (this.settings.additionalIssuers || []).filter(
      (item) =>
        countryName(item).localeCompare(issuer, undefined, {
          sensitivity: 'base',
        }) !== 0
    );

    await this.saveSettings();
    this.refreshFilterViews();
  },

  async addReferenceYear(value) {
    const year = Number(value);

    if (!Number.isInteger(year) || year < 1999 || year > 2200) {
      return false;
    }

    const normalized = String(year);
    const current = Array.isArray(this.settings.additionalYears)
      ? this.settings.additionalYears.map(String)
      : [];

    if (this.getReferenceYears().includes(normalized)) {
      return false;
    }

    this.settings.additionalYears = [...new Set([...current, normalized])].sort(
      (a, b) => Number(a) - Number(b)
    );

    await this.saveSettings();
    this.refreshFilterViews();

    return true;
  },

  async removeReferenceYear(value) {
    const year = String(Number(value));

    this.settings.additionalYears = (this.settings.additionalYears || [])
      .map(String)
      .filter((item) => item !== year);

    await this.saveSettings();
    this.refreshFilterViews();
  },
};
