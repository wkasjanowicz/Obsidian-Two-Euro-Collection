import { PluginSettingTab, Notice, SecretComponent } from 'obsidian';
import { isTrue, countryName, errorText } from '../utils.js';

/*
 * Settings are described once as definitions (name, description, render).
 * Obsidian (1.13+) renders them itself and indexes them for settings search.
 */
/**
 * @param {unknown} value
 * @returns {string}
 */
const settingText = (value) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export class EuroSettings extends PluginSettingTab {
  /**
   * @param {import('obsidian').App} app
   * @param {import('../types').TwoEuroPlugin} plugin
   */
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    /** @type {Record<string, string>} */
    this.folderDraft = {};
  }

  /* Re-renders after changes that add or remove settings. */
  refresh() {
    this.update();
  }

  /** @returns {import('obsidian').SettingDefinitionItem[]} */
  getSettingDefinitions() {
    const p = this.plugin,
      t = (/** @type {string} */ k, /** @type {Record<string, unknown>} */ v = {}) => p.t(k, v);
    /**
     * @param {string} name
     * @param {(setting: import('obsidian').Setting) => unknown} render
     * @param {string} [desc]
     * @returns {import('obsidian').SettingDefinitionRender}
     */
    const def = (name, render, desc = '') => ({
      name,
      desc,
      render: (setting) => {
        render(setting);
      },
    });
    const text =
      /**
       * @param {string} field
       * @param {{ placeholder?: string, onChange: (value: string) => unknown }} options
       */
      (field, { placeholder = '', onChange }) =>
        /** @param {import('obsidian').Setting} setting */
        (setting) =>
          setting.addText((x) =>
            x
              .setPlaceholder(placeholder)
              .setValue(settingText(p.settings[field]))
              .onChange(onChange)
          );
    const button =
      /**
       * @param {string} label
       * @param {() => unknown} onClick
       * @param {{ cta?: boolean, warning?: boolean }} [options]
       */
      (label, onClick, { cta = false, warning = false } = {}) =>
        /** @param {import('obsidian').Setting} setting */
        (setting) =>
          setting.addButton((b) => {
            b.setButtonText(label).onClick(onClick);
            if (cta) b.setCta();
            if (warning) b.setWarning();
          });
    const month = new Date().toISOString().slice(0, 7);
    const requests =
      p.settings.numistaRequestMonth === month ? p.settings.numistaRequestCount || 0 : 0;

    /** @type {import('obsidian').SettingDefinitionGroup} */
    const general = {
      type: 'group',
      items: [
        def(
          t('settings.language'),
          (setting) =>
            setting.addDropdown((d) => {
              d.addOption('auto', t('settings.auto'));
              for (const lang of p.getAvailableLanguages()) d.addOption(lang.code, lang.name);
              d.setValue(p.settings.language || 'auto').onChange(async (v) => {
                p.settings.language = v;
                await p.saveSettings();
                this.refresh();
              });
            }),
          t('settings.languageDesc')
        ),
        def(
          t('settings.columns'),
          (setting) =>
            setting.addSlider((sl) =>
              sl
                .setLimits(4, 10, 1)
                .setValue(Number(p.settings.columns) || 6)
                .setDynamicTooltip()
                .onChange(async (v) => {
                  p.settings.columns = v;
                  await p.saveSettings();
                })
            ),
          t('settings.columnsDesc')
        ),
        def(
          t('settings.defaultCurrency'),
          text('defaultCurrency', {
            placeholder: 'PLN',
            onChange: async (v) => {
              p.settings.defaultCurrency = v.trim();
              await p.saveSettings();
            },
          })
        ),
      ],
    };

    /*
     * Folder settings are applied together with a button, so that the
     * collection is moved to the new location instead of being lost.
     */
    /**
     * @param {string} key
     * @param {string} field
     */
    const folderField = (key, field) =>
      def(
        t(key),
        text(field, {
          onChange: (v) => {
            this.folderDraft[field] = v;
          },
        })
      );
    /** @type {import('obsidian').SettingDefinitionGroup} */
    const folders = {
      type: 'group',
      heading: t('settings.headingFolders'),
      items: [
        folderField('settings.root', 'rootFolder'),
        folderField('settings.collection', 'collectionFolder'),
        folderField('settings.coins', 'coinsFolder'),
        folderField('settings.covers', 'coversFolder'),
        folderField('settings.dashboardFile', 'dashboardFile'),
        def(
          t('settings.applyFolders'),
          button(
            t('settings.applyFoldersButton'),
            async () => {
              if (!Object.keys(this.folderDraft).length) return;
              await p.changeFolders(this.folderDraft);
              this.folderDraft = {};
              this.refresh();
            },
            { cta: true }
          ),
          t('settings.applyFoldersDesc')
        ),
      ],
    };

    /** @param {import('obsidian').Setting} setting */
    const apiKeySetting = (setting) => {
      // The key is kept in Obsidian's secure secret storage.
      setting.addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(p.settings.numistaSecretId || '')
          .onChange(async (id) => {
            p.settings.numistaSecretId = id || '';
            if (id) p.settings.numistaApiKey = '';
            await p.saveSettings();
          })
      );
    };
    /** @type {import('obsidian').SettingDefinitionGroup} */
    const numista = {
      type: 'group',
      heading: t('settings.headingNumista'),
      items: [
        def(t('settings.apiKey'), apiKeySetting, t('settings.apiKeyDesc', { count: requests })),
        def(
          t('settings.syncUpdateExisting'),
          (setting) =>
            setting.addToggle((x) =>
              x.setValue(isTrue(p.settings.syncUpdateExisting)).onChange(async (v) => {
                p.settings.syncUpdateExisting = v;
                await p.saveSettings();
              })
            ),
          t('settings.syncUpdateExistingDesc')
        ),
        def(
          t('settings.cacheDays'),
          (setting) =>
            setting
              .addSlider((slider) =>
                slider
                  .setLimits(0, 30, 1)
                  .setValue(
                    Number.isFinite(Number(p.settings.numistaCacheDays))
                      ? Number(p.settings.numistaCacheDays)
                      : 7
                  )
                  .setDynamicTooltip()
                  .onChange(async (value) => {
                    p.settings.numistaCacheDays = value;
                    await p.saveSettings();
                  })
              )
              .addButton((b) =>
                b.setButtonText(t('settings.cacheClear')).onClick(async () => {
                  await p.clearNumistaCache();
                  new Notice(t('settings.cacheCleared'));
                })
              ),
          t('settings.cacheDaysDesc')
        ),
      ],
    };

    /** @type {import('obsidian').SettingDefinitionGroup} */
    const setup = {
      type: 'group',
      heading: t('settings.initialSetup'),
      items: [
        def(
          t('settings.initStructure'),
          button(
            t('settings.initStructureButton'),
            async () => {
              await p.ensureDashboard();
              new Notice(t('settings.initStructureDone'));
            },
            { cta: true }
          ),
          t('settings.initStructureDesc')
        ),
        def(
          t('settings.initReferenceData'),
          button(
            t('settings.initReferenceDataButton'),
            async () => {
              const result = await p.initializeReferenceData();
              new Notice(
                t('settings.initReferenceDataDone', {
                  issuers: result.issuers,
                  years: result.years,
                })
              );
              this.refresh();
            },
            { cta: true }
          ),
          t('settings.initReferenceDataDesc')
        ),
        def(
          t('settings.initStarterPack'),
          button(t('settings.initStarterPackButton'), async () => {
            if (!(await p.confirm(t('confirm.installStarter')))) return;
            try {
              await p.installStarterCollection();
            } catch (error) {
              console.error('Starter collection installation', error);
              new Notice(errorText(error));
            }
          }),
          t('settings.initStarterPackDesc')
        ),
      ],
    };

    let issuerToAdd = '',
      yearToAdd = '';
    const additionalIssuers = Array.isArray(p.settings.additionalIssuers)
      ? p.settings.additionalIssuers
      : [];
    const additionalYears = Array.isArray(p.settings.additionalYears)
      ? p.settings.additionalYears
      : [];
    /** @type {import('obsidian').SettingDefinitionGroup} */
    const reference = {
      type: 'group',
      heading: t('settings.referenceData'),
      items: [
        def(
          t('settings.referenceYearFrom'),
          (setting) =>
            setting.addText((x) => {
              x.inputEl.type = 'number';
              x.inputEl.min = '1999';
              x.inputEl.max = '2200';
              x.setValue(String(p.settings.referenceYearFrom || 1999)).onChange(async (value) => {
                const year = Number(value);
                if (!Number.isInteger(year) || year < 1999 || year > 2200) return;
                p.settings.referenceYearFrom = year;
                await p.saveSettings();
                p.refreshFilterViews();
              });
            }),
          t('settings.referenceYearFromDesc')
        ),
        def(
          t('settings.futureYears'),
          (setting) =>
            setting.addSlider((slider) =>
              slider
                .setLimits(0, 10, 1)
                .setValue(
                  Number.isFinite(Number(p.settings.futureYears))
                    ? Number(p.settings.futureYears)
                    : 1
                )
                .setDynamicTooltip()
                .onChange(async (value) => {
                  p.settings.futureYears = value;
                  await p.saveSettings();
                  p.refreshFilterViews();
                })
            ),
          t('settings.futureYearsDesc')
        ),
        def(
          t('settings.additionalIssuer'),
          (setting) =>
            setting
              .addText((x) =>
                x.setPlaceholder(t('settings.issuerPlaceholder')).onChange((value) => {
                  issuerToAdd = value;
                })
              )
              .addButton((b) =>
                b
                  .setButtonText(t('settings.addIssuerButton'))
                  .setCta()
                  .onClick(async () => {
                    const issuer = countryName(issuerToAdd);
                    if (!issuer) return;
                    if (await p.addReferenceIssuer(issuer)) {
                      new Notice(t('settings.issuerAdded', { issuer }));
                      this.refresh();
                    } else new Notice(t('settings.issuerExists'));
                  })
              ),
          `${t('settings.additionalIssuerDesc')} ${t('settings.referenceDataDesc')}`
        ),
        ...additionalIssuers.map((issuer) =>
          def(
            issuer,
            button(
              t('settings.removeIssuer'),
              async () => {
                await p.removeReferenceIssuer(issuer);
                this.refresh();
              },
              { warning: true }
            )
          )
        ),
        def(
          t('settings.additionalYear'),
          (setting) =>
            setting
              .addText((x) => {
                x.inputEl.type = 'number';
                x.inputEl.min = '1999';
                x.inputEl.max = '2200';
                x.setPlaceholder(t('settings.yearPlaceholder')).onChange((value) => {
                  yearToAdd = value;
                });
              })
              .addButton((b) =>
                b
                  .setButtonText(t('settings.addYearButton'))
                  .setCta()
                  .onClick(async () => {
                    const year = Number(yearToAdd);
                    if (!Number.isInteger(year) || year < 1999 || year > 2200) {
                      new Notice(t('settings.invalidYear'));
                      return;
                    }
                    if (await p.addReferenceYear(year)) {
                      new Notice(t('settings.yearAdded', { year }));
                      this.refresh();
                    } else new Notice(t('settings.yearExists'));
                  })
              ),
          t('settings.additionalYearDesc')
        ),
        ...additionalYears.map((year) =>
          def(
            String(year),
            button(
              t('settings.removeYear'),
              async () => {
                await p.removeReferenceYear(year);
                this.refresh();
              },
              { warning: true }
            )
          )
        ),
      ],
    };

    return [general, folders, numista, setup, reference];
  }
}
