import { normalizePath, getLanguage as getObsidianLanguage } from 'obsidian';
import { BASE_LANGUAGE } from '../i18n/en.js';
import { formatText, tx } from '../utils.js';
import { BUILTIN_LANGUAGES } from '../i18n/builtin.js';

export const i18nMethods = {
  languagesFolder() {
    return normalizePath(`${this.manifest.dir}/Languages`);
  },

  async loadExternalLanguages() {
    this.externalLanguages = {};
    this.availableLanguages = [{ code: 'en', name: 'English' }];
    for (const [code, lang] of Object.entries(BUILTIN_LANGUAGES)) {
      if (!lang || typeof lang.strings !== 'object') continue;
      this.externalLanguages[code] = { ...lang.strings };
      this.availableLanguages.push({ code, name: tx(lang.name) || code });
    }
    const sortLanguages = () =>
      this.availableLanguages.sort((a, b) =>
        a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.name.localeCompare(b.name)
      );
    sortLanguages();
    const folder = this.languagesFolder();
    try {
      if (!(await this.app.vault.adapter.exists(folder))) return;
      const listing = await this.app.vault.adapter.list(folder);
      for (const path of listing.files.filter((file) => file.toLowerCase().endsWith('.json'))) {
        try {
          const parsed = JSON.parse(await this.app.vault.adapter.read(path)),
            code = tx(
              parsed.code ||
                path
                  .split('/')
                  .pop()
                  .replace(/\.json$/i, '')
            ).toLowerCase(),
            name = tx(parsed.name) || code,
            strings = parsed.strings && typeof parsed.strings === 'object' ? parsed.strings : {};
          if (!code || code === 'en') continue;
          this.externalLanguages[code] = { ...(this.externalLanguages[code] || {}), ...strings };
          const known = this.availableLanguages.find((lang) => lang.code === code);
          if (known) known.name = name;
          else this.availableLanguages.push({ code, name });
        } catch (error) {
          console.warn('Invalid language file', path, error);
        }
      }
      sortLanguages();
    } catch (error) {
      console.warn('Languages folder unavailable', error);
    }
  },

  getAvailableLanguages() {
    return this.availableLanguages || [{ code: 'en', name: 'English' }];
  },

  getLanguage() {
    const selected = tx(this.settings?.language || 'auto').toLowerCase();
    if (selected !== 'auto' && (selected === 'en' || this.externalLanguages?.[selected]))
      return selected;
    const locale = String(getObsidianLanguage() || 'en')
      .toLowerCase()
      .split('-')[0];
    return this.externalLanguages?.[locale] ? locale : 'en';
  },

  t(key, vars = {}) {
    const lang = this.getLanguage(),
      strings = lang === 'en' ? BASE_LANGUAGE : this.externalLanguages?.[lang] || {};
    return formatText(strings[key] ?? BASE_LANGUAGE[key] ?? key, vars);
  },
};
