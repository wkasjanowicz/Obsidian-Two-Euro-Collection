import { normalizePath } from 'obsidian';

/*
 * Persistent cache of Numista type details and issue lists, stored in the
 * plugin folder (numista-cache.json). Repeated synchronizations of the same
 * range then do not spend API requests. Entries expire after
 * settings.numistaCacheDays days (0 disables the cache).
 */
const trimType = (d) =>
  d && {
    id: d.id,
    title: d.title,
    url: d.url,
    issuer: d.issuer && { code: d.issuer.code, name: d.issuer.name },
    object_type: d.object_type && { id: d.object_type.id, name: d.object_type.name },
    value: d.value && {
      numeric_value: d.value.numeric_value,
      text: d.value.text,
      currency: d.value.currency && {
        name: d.value.currency.name,
        full_name: d.value.currency.full_name,
      },
    },
    commemorated_topic: d.commemorated_topic,
    obverse: d.obverse,
    pictures: d.pictures,
    images: d.images,
  };

const trimIssues = (raw) =>
  (Array.isArray(raw) ? raw : raw?.issues || []).map((issue) => ({
    id: issue.id,
    year: issue.year,
    gregorian_year: issue.gregorian_year,
    mint_letter: issue.mint_letter,
    mintage: issue.mintage,
    comment: issue.comment,
  }));

export const cacheMethods = {
  numistaCachePath() {
    return normalizePath(`${this.manifest.dir}/numista-cache.json`);
  },

  async loadNumistaCache() {
    if (this._numistaCache) return this._numistaCache;
    this._numistaCache = { types: {}, issues: {} };
    try {
      const path = this.numistaCachePath();
      if (await this.app.vault.adapter.exists(path)) {
        const parsed = JSON.parse(await this.app.vault.adapter.read(path));
        this._numistaCache = { types: parsed.types || {}, issues: parsed.issues || {} };
      }
    } catch (error) {
      console.warn('Numista cache unreadable, starting empty', error);
    }
    return this._numistaCache;
  },

  numistaCacheMaxAge() {
    const days = Number(this.settings.numistaCacheDays);
    return (Number.isFinite(days) ? Math.max(0, days) : 7) * 24 * 60 * 60 * 1000;
  },

  async cachedNumista(kind, id, fetcher, { fresh = false } = {}) {
    const maxAge = this.numistaCacheMaxAge();
    const cache = await this.loadNumistaCache();
    const key = String(id);
    const entry = cache[kind][key];
    if (!fresh && maxAge && entry && Date.now() - entry.t < maxAge) return entry.v;
    const value = await fetcher();
    if (maxAge) {
      cache[kind][key] = { t: Date.now(), v: value };
      this.scheduleNumistaCacheSave();
    }
    return value;
  },

  async getTypeDetails(id, options = {}) {
    return this.cachedNumista(
      'types',
      id,
      async () => trimType(await this.api(`/types/${encodeURIComponent(id)}?lang=en`)),
      options
    );
  },

  async getTypeIssues(id, options = {}) {
    return this.cachedNumista(
      'issues',
      id,
      async () => trimIssues(await this.api(`/types/${encodeURIComponent(id)}/issues?lang=en`)),
      options
    );
  },

  scheduleNumistaCacheSave() {
    if (this._cacheSaveTimer) window.clearTimeout(this._cacheSaveTimer);
    this._cacheSaveTimer = window.setTimeout(() => this.saveNumistaCache(), 2000);
  },

  async saveNumistaCache() {
    if (this._cacheSaveTimer) window.clearTimeout(this._cacheSaveTimer);
    this._cacheSaveTimer = null;
    if (!this._numistaCache) return;
    try {
      await this.app.vault.adapter.write(
        this.numistaCachePath(),
        JSON.stringify(this._numistaCache)
      );
    } catch (error) {
      console.warn('Cannot save Numista cache', error);
    }
  },

  async clearNumistaCache() {
    this._numistaCache = { types: {}, issues: {} };
    await this.saveNumistaCache();
  },

  numistaCacheSize() {
    const cache = this._numistaCache;
    return cache ? Object.keys(cache.types).length + Object.keys(cache.issues).length : 0;
  },
};
